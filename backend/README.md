# Queue API

Restore `backend/.env` from your existing setup, or copy `.env.example` to `.env`
and fill in `MONGODB_URI` and `JWT_SECRET`. Use the existing database containing
your student accounts; the local example only works if MongoDB is running locally.
The `.env` file is ignored by Git and is not included when cloning the project.
The server always loads the file from `backend/.env`, regardless of where it is started.

In `backend`, run `npm install` and `npm run dev`.
`PORT` defaults to `5000`. The API starts after MongoDB
connects and the ticket and appointment indexes are ready.

The frontend uses `VITE_API_URL`, defaulting to `http://127.0.0.1:5000/api`.
Department service names and durations come from the existing `departments`
collection. No reseeding is required.

## Troubleshooting sign-in connections

Start both the backend and frontend (`npm run dev` in each directory). Open
`http://127.0.0.1:5000/api/health` and confirm `database` is `connected` before
signing in. If this URL cannot be reached, check the backend terminal and
`backend/.env`; `ECONNREFUSED 127.0.0.1:27017` means local MongoDB is unavailable.
For Atlas, restore the correct URI and check its network access settings.
If the backend port differs, set `VITE_API_URL` in `frontend/.env` to the matching
API URL (including `/api`) and restart Vite. When opening the frontend from
another device, use the backend machine's reachable address instead of
`127.0.0.1`, and set `CLIENT_URL` to the frontend's exact origin.

## Student endpoints

All queue endpoints require a Bearer JWT and an active student account.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/queue/mine` | Active ticket and up to 20 recent finished/cancelled tickets |
| POST | `/api/queue` | Create a ticket with `departmentId`, `services` (array of names), and optional `notes` |
| PATCH | `/api/queue/:id/cancel` | Cancel the signed-in student's waiting ticket |

The server validates the selected services against the department and snapshots
their durations. It does not trust a duration sent by the client. A MongoDB
partial unique index permits only one `waiting`, `called`, or `serving` ticket
per student across all departments. Ticket numbers increment per department
and Vietnam calendar date; a failed submission can leave a gap in the numbering.

Queue entries require an active department and a queue with `isOpen: true` and
`isPaused: false`. Opening hours remain informational; acceptance follows these
queue flags. Multiple selected services assume the department can handle them
in a single visit.

My Queue receives WebSocket update signals and reloads persisted data after each
change, on reconnect, and when the window regains focus. Waiting counts and people ahead are based on saved tickets.
Waiting-time estimates and active-counter counts are `null` until counter
availability and service progress are implemented. Missing service durations
also remain unknown instead of becoming zero-minute estimates.

Staff actions now move saved tickets through `waiting → called → serving → completed`.
Students can cancel only waiting tickets. Staff can cancel a waiting ticket in
their office or their own current visit; only a called visit can be marked
`no_show`. Terminal tickets move to history and release the student's active
ticket restriction. No-shows require an explicit staff action; My Appointments
explains that the ticket is no longer valid and offers a new ticket or booking.
At the office's final closing time (Vietnam time), waiting and called tickets
are automatically cancelled with `cancellationReason: end_of_day`. Serving
visits remain active. Linked appointments and past appointments that never
entered the queue are cancelled too; completed and no-show results are preserved.
The 15-second admission sweep also performs cancellation, including catch-up
after a server restart. Student queue/appointment reads and staff actions run
the same cleanup before accessing tickets. Lunch breaks do not end the day.

## Live staff queue

These endpoints require a signed JWT, an active staff account, and an assigned
department read from the database. The browser cannot choose another department.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/staff/queue` | Office waiting list, staff member's current visit, last 50 terminal office visits, and today's completed count |
| POST | `/api/staff/queue/call` | Atomically claim the oldest waiting ticket and mark it called |
| PATCH | `/api/staff/tickets/:id/start` | Called → serving |
| PATCH | `/api/staff/tickets/:id/complete` | Serving → completed |
| PATCH | `/api/staff/tickets/:id/recall` | Update the last call time, preserving the first call time |
| PATCH | `/api/staff/tickets/:id/no_show` | Called → no-show |
| PATCH | `/api/staff/tickets/:id/cancel` | Cancel an office waiting ticket or the staff member's current visit |
| PATCH | `/api/staff/queue/pause` | Set `{ "paused": true/false }` for the whole office |

Conditional updates reject stale or invalid transitions with HTTP 409. A partial
unique index limits each staff member to one called/serving ticket, including
concurrent requests from different tabs. Queue order uses service date and ticket
number. Pausing or closing prevents new calls; current visits can still finish.
Each transition records its timestamp and actor in `statusHistory`; legacy
tickets remain readable without fabricated timestamps. Restart the backend to
load these routes and initialize the new index before using live staff actions.

Staff, My Queue, My Appointments, and the student's home activity receive live
updates through Socket.IO with `transports: ["websocket"]`; there is no queue
polling or HTTP long-polling fallback. The development preview continues to use
isolated demo data.

### WebSocket setup and verification

Run `npm install` in both `backend` and `frontend`, then restart both dev servers.
Socket.IO shares the API's HTTP server and port, at `/socket.io/`. The browser
uses the origin of `VITE_API_URL`; configure a reverse proxy to forward WebSocket
upgrades for `/socket.io/` to the backend, and set `CLIENT_URL` to the frontend
origin. HTTPS deployments automatically use secure WebSocket (WSS).

The handshake sends the existing JWT in `auth.token`. The server verifies its
signature, expiry, account role, active status, and session version. Expired
connections close; revoked sessions are rechecked every 30 seconds. Only
authenticated students/staff receive `queue:updated`, an empty invalidation
signal with no ticket or personal data. Each client then fetches its own
authorized API snapshot. Signals cover joins, calls/recalls, service transitions,
cancellations, pause/resume, appointment admission/expiry, and office edits.
Initial connection and reconnection also refresh the snapshot to recover missed
events. Updates received during an in-flight fetch trigger another fetch.

To check manually, open a student session and a staff session in separate browser
profiles. Join the staff's office queue, keep My Queue open, then call, recall,
start, and complete the visit as staff. The student status/history and other
waiting students' people-ahead counts update immediately. In browser Network,
verify `/socket.io/?EIO=4&transport=websocket` upgrades with status 101 and there
are no repeated 5-second queue requests. Disconnect/reconnect the student's
network and confirm the latest state loads automatically.

`node --test tests/staff.test.js` includes real WebSocket integration checks.
The current event bus supports one backend process. Multiple backend instances
would need a shared event bus/Socket.IO adapter before deployment.

## Appointment booking

All appointment endpoints require a Bearer JWT and an active student account.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/appointments/availability?departmentId=...&date=YYYY-MM-DD&services=Transcript&services=Verification` | Available intervals for all selected services |
| POST | `/api/appointments` | Book with `departmentId`, `services` (name array), `date`, `startsAt` (ISO time), and optional `notes` |
| GET | `/api/appointments` | List the student's saved appointments |
| PATCH | `/api/appointments/:id/cancel` | Cancel a future confirmed appointment and release its time |

One appointment covers services from one department in a single visit. Service
names and positive integer durations are validated and snapshotted by the server;
the reserved duration is their sum. Services without a configured duration cannot
be booked. Responses include `services` with name/duration pairs and
`estimatedServiceTime` in minutes.

Booking uses Vietnam time, today through 30 days ahead, Monday to Friday by
default. Department fields `bookingEnabled`, `bookingWeekdays` (Sunday = 0), and
`bookingExcludedDates` override these rules. Hours use `HH:mm - HH:mm` periods
separated by `|`; blank hours default to `07:30 - 11:30 | 13:00 - 16:30`.
Malformed hours produce no slots. Starts occur every 15 minutes from each
period's opening; the entire visit must fit before that period ends.

Until counter scheduling exists, appointment capacity is one visit at a time per
department. Unique MongoDB multikey indexes reserve each occupied minute in a
single insert, preventing concurrent overlapping appointments for a department
or student (including across departments). Adjacent visits are allowed.
Cancellation removes the confirmed reservation from those indexes atomically.

Five minutes before an appointment starts, the backend creates one linked queue
ticket for it. A 15-second server sweep performs admission even if nobody has
the page open; staff and student queue reads also trigger a sweep after a restart.
The ticket uses the same office sequence and staff actions as a walk-in. Staff
see its appointment reference and scheduled time, and students see the queue
number and live service status in My Queue and My Appointments. The unique
`one_ticket_per_appointment` index prevents duplicate admission across API
processes. Existing appointment reservations remain in force while staff serve
the ticket. A student can cancel the appointment before its scheduled start
while its linked ticket is waiting; staff can cancel a linked ticket at any
stage, which also cancels the booking. If the student already has an active
walk-in ticket, admission retries when that ticket leaves the active queue.
Queue capacity is still separate from appointment slot capacity; the scheduled
time reserves a booking interval, not a guaranteed moment when staff calls.

### Repair legacy appointment indexes

Older databases may retain unique indexes on `reference` and `occupiedMinutes`.
Current bookings derive their reference from `_id` and store `reservedMinutes`;
those obsolete constraints can reject available times because the old fields are
missing. Only duplicate keys on the current reservation indexes produce a 409
overlap response. Other database errors are logged and return a service error.

From `backend`, run `npm run migrate:appointment-indexes` for a read-only preview,
then `npm run migrate:appointment-indexes -- --apply` to apply the repair using
`backend/.env`. Run this after deploying the current booking code to all API
instances, so no old process writes `occupiedMinutes` during the migration.
The script requires both current unique reservation indexes and validates every
confirmed appointment's minute reservations before removing exactly
`reference_1`, `department_1_occupiedMinutes_1`, and
`student_1_occupiedMinutes_1`. Missing replacement indexes, invalid reservations,
or unexpected legacy definitions stop the migration for review. The script does
not update or delete appointment documents and checks their fingerprint before
and after; concurrent bookings can cause that check to report a change. Repeated
runs are safe when the old indexes have already been removed. Restart an API
started without automatic reload to pick up the updated error handling.

## Admin user management

The User Management screen supports creating and editing student/staff accounts,
assigning staff departments, and disabling/enabling accounts while keeping their
history. Search by name, email or student ID and filter by role/status.

All routes below require an active admin session:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/users?search=...&role=student&status=active&page=1` | List 12 accounts per page; role/status filters are optional |
| POST | `/api/admin/users` | Create an active student/staff account with an initial password |
| PUT | `/api/admin/users/:id` | Edit profile and role/department |
| PATCH | `/api/admin/users/:id/status` | Enable/disable with boolean `isActive` |

Create/edit fields: `fullName`, `email`, `role`, optional `phone`, `studentID`
(required for students), and `department` (required for staff). Creation also
requires matching `password`/`confirmation`, at least 8 characters and at most
72 UTF-8 bytes. New staff assignments require an active, unarchived department.
Emails are normalized and the unique email index rejects duplicate accounts.
Admin accounts cannot be created or modified through these endpoints.

Edits/status changes require the `updatedAt` value returned by the list or last
mutation (explicit `null` for legacy accounts without timestamps); stale updates
return 409. Profile and status changes revoke previous
sessions, including after re-enabling an account. Passwords are changed through
the existing Password Requests workflow. Staff must finish/cancel a current
visit before disabling their account or changing their role/office. Students
must resolve active tickets/upcoming appointments before changing roles.

## Verification

`npm test` runs integration tests against MongoDB using a unique, temporary
`smartqueue_test_*` database and drops only that database on completion.
It uses `TEST_MONGODB_URI`, then `MONGODB_URI`, then local MongoDB. The test
connection needs permission to create databases and indexes. Existing project
data is not modified by the tests.
