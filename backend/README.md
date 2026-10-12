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

My Queue reloads persisted data every 15 seconds while visible and when the
window regains focus. Waiting counts and people ahead are based on saved tickets.
Waiting-time estimates and active-counter counts are `null` until counter
availability and service progress are implemented. Missing service durations
also remain unknown instead of becoming zero-minute estimates.

Staff actions now move saved tickets through `waiting → called → serving → completed`.
Students can cancel only waiting tickets. Staff can cancel a waiting ticket in
their office or their own current visit; only a called visit can be marked
`no_show`. Terminal tickets move to history and release the student's active
ticket restriction. No-shows require an explicit staff action, and saved tickets
do not automatically expire at midnight.

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

Both staff and student screens refresh every 5 seconds while visible and when
returning to the page. The development preview continues to use isolated demo data.

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

Booking is separate from live queue admission and does not create a queue ticket.
Appointment check-in, staff handling of appointments, and shared capacity between
walk-ins and appointments remain future work.

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

## Verification

`npm test` runs integration tests against MongoDB using a unique, temporary
`smartqueue_test_*` database and drops only that database on completion.
It uses `TEST_MONGODB_URI`, then `MONGODB_URI`, then local MongoDB. The test
connection needs permission to create databases and indexes. Existing project
data is not modified by the tests.
