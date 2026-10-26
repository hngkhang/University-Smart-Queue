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

### Streaming AI answers

The assistant's **Hỏi đáp thủ tục** mode sends authenticated questions to
`POST /api/ai/chat/stream`. The endpoint reads Gemini's streamed structured
response and forwards newline-delimited JSON events: `partial` contains the
answer text received so far, `done` contains the final answer and verified
sources, and `error` reports a failure after streaming has begun. The existing
`POST /api/ai/chat` JSON endpoint remains available. A disconnected browser
aborts the upstream generation, and the chat removes an unfinished answer if
the stream fails. In deployments behind a reverse proxy, disable response
buffering for `/api/ai/chat/stream` so each update reaches the browser promptly.

Run `node --test tests/aiStreaming.test.js tests/aiStreamingRoutes.test.js`
from `backend/` to verify the streaming protocol without MongoDB or an AI key.

### AI knowledge ingestion (local Chroma, no Docker)

Chroma must be running in addition to MongoDB and the backend. With this project's
local Chroma environment installed, start it from the repository root in PowerShell:

```powershell
& .\.local\chroma-venv\Scripts\chroma.exe run --path .\backend\data\chroma --host 127.0.0.1 --port 8000
```

Keep that process running while using the chatbot or uploading knowledge. Reuse
the same persistence path so the existing knowledge collection is loaded.

From `backend/`, run `npm run ai:ingest -- --dry-run` to validate and split
`data/raw/KB-SmartQueue-Student-Service-Guide.vi.md` without calling Gemini or Chroma.
Then, with Chroma listening on the configured host/port, run `npm run ai:ingest`.
Neither the Express server, MongoDB nor the frontend needs to run for ingestion.

The command reads `backend/.env` directly: `GEMINI_API_KEY`,
`AI_EMBEDDING_MODEL=gemini-embedding-001`, `CHROMA_HOST`, `CHROMA_PORT`,
`CHROMA_SSL`, `CHROMA_COLLECTION`, and the character chunk/overlap settings.
It sends document text to Gemini in groups of at most 20, uses
`RETRIEVAL_DOCUMENT` with 3072 dimensions, and stores vectors, text, section,
source filename, document ID and version in a cosine Chroma collection.
Raw data and the local Chroma directory remain ignored by Git.

Unchanged content/configuration is skipped without calling Gemini again.
For an update, all embeddings are prepared before writing; old chunks for that
document alone are removed after the new chunks are verified. If interrupted
between saving and cleanup, rerunning completes cleanup. This is not an atomic
publication mechanism for concurrent writers across multiple hosts. Chat pauses
while the local lock exists and rejects mixed revisions or an index changed during retrieval. Runs from this
checkout are serialized with `data/.ai-ingest.lock`. After a forced interruption,
remove that lock only after confirming the previous process has stopped.

Use `npm run ai:ingest -- --file data/raw/another-guide.md` for another public
knowledge file with the same `- Mã tài liệu:` and `- Phiên bản:` metadata format.
Use a distinct document ID for each document. A different embedding model needs
a compatible implementation and a separate collection, not mixed vectors.
Embedding queries must use the same model/dimensions and `RETRIEVAL_QUERY`.

`npm run test:ai-ingest` checks failure preservation, idempotence, version cleanup
and provider validation without sending documents to Gemini.

### Admin Markdown replacement

Open **Admin → Tài liệu AI** (`/admin/knowledge`) to select a UTF-8 `.md` file
of at most 2 MiB. Both the browser and backend validate the upload. The selected
filename can differ: the saved filename is always
`data/raw/KB-SmartQueue-Student-Service-Guide.vi.md`.

Keep the current `- Mã tài liệu:` value and include `- Phiên bản:` in the new
document. The screen displays the expected ID and current version. If the source
file does not yet exist, use `SQ-KB-STUDENT-GUIDE`. This upload replaces the whole
document; it does not append to it. Only public student-facing content belongs in
this knowledge source. The resulting public collection must fit the existing
1,000-chunk limit.

The authenticated admin endpoint is `PUT /api/admin/knowledge`, with the file
bytes as `application/octet-stream` and the URI-encoded original filename in
`X-File-Name`. `GET /api/admin/knowledge` returns source metadata, the size limit,
the current operation state and whether ingestion is locked. Normal users and
staff cannot use either endpoint. Uploads require the same Gemini and Chroma
configuration as the CLI; they can take several minutes. If deploying behind a
proxy, allow a sufficiently long request timeout. Closing the page does not cancel
an accepted upload; reopen the page to check its status before retrying. Operation
messages live for the server process lifetime; file metadata persists on disk.

The upload stages the file, creates/verifies the new index and replaces the source
file only after indexing succeeds. A shared `.ai-ingest.lock` prevents overlapping
CLI/admin updates and pauses chat while publishing. On a handled failure after a
database write, the service restores the previous document vectors. If recovery
fails, it retains the lock and reports the failure instead of serving a mixed
index. After a server crash or failed recovery, confirm the ingest process has
stopped, restore Chroma connectivity, remove the stale lock and run
`npm run ai:ingest` to reconcile the index with the saved source file. This is a
single-host workflow, not a distributed transaction across machines. Runtime
files remain ignored by Git.

Run `npm run test:ai-upload` for authorization, file validation, replacement,
concurrency and rollback checks without calling Gemini or a live database.

### Application tests

`npm run test:ai` runs ingestion/provider/retrieval unit checks and authenticated
route checks. Route tests use their own temporary `smartqueue_test_ai_*` MongoDB
database; Gemini is mocked for automated tests.

### AI chat

Run Chroma, the backend and the frontend, then sign in with an active account.
`GET /api/ai/status` checks key presence and a compatible, nonempty public index.
It does not call Gemini or certify quota/model access; errors from the provider
are surfaced when a question is sent. Reopen the widget or use its refresh button
after correcting configuration. The default chat model is `gemini-3.5-flash-lite`.

`POST /api/ai/chat` requires a valid JWT and accepts `{ "message": "..." }`.
Queries use `RETRIEVAL_QUERY` with the same 3072-dimensional model as ingestion.
Only public indexed documents are searched. Cosine-distance filtering defaults to
`RAG_MAX_DISTANCE=0.6`; this is a tunable retrieval cutoff, not a confidence score.
Top matching sections are expanded from their overlapping chunks to preserve
headings and context. Answers include validated numeric citations and readable
excerpts. Missing evidence or invalid citations produce an explicit unknown response.
This validates citation IDs, not semantic entailment; a formal evaluation remains necessary.

Chat is single-turn: prior bubbles are displayed locally but not sent to the model.
It does not read personal appointments, book/cancel anything or infer live queue status.
The process limits each account to one in-flight request and 10 requests per minute;
distributed deployments need a shared limiter. Timeouts/quota/network errors are
localized. Logs include request ID, model, prompt version, latency and generation
token usage without question text or credentials. Cost estimation, embedding usage
accounting and the full assignment evaluation report are not implemented yet.

`npm test` runs integration tests against MongoDB using a unique, temporary
`smartqueue_test_*` database and drops only that database on completion.
It uses `TEST_MONGODB_URI`, then `MONGODB_URI`, then local MongoDB. The test
connection needs permission to create databases and indexes. Existing project
data is not modified by the tests.
