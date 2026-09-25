# Queue API

Run `npm install` and `npm run dev`. The existing `.env` needs `MONGODB_URI`
and `JWT_SECRET`; `PORT` defaults to `5000`. The API starts after MongoDB
connects and the ticket indexes are ready.

The frontend uses `VITE_API_URL`, defaulting to `http://127.0.0.1:5000/api`.
Department service names and durations come from the existing `departments`
collection. No reseeding is required.

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

Staff calling/serving/completing tickets, automatic no-show handling, session
expiry, and appointment capacity integration are not part of these endpoints.
Until those workflows exist, students can leave the queue by cancelling a
waiting ticket. A saved ticket does not automatically expire at midnight.

## Verification

`npm test` runs integration tests against MongoDB using a unique, temporary
`smartqueue_test_*` database and drops only that database on completion.
It uses `TEST_MONGODB_URI`, then `MONGODB_URI`, then local MongoDB. The test
connection needs permission to create databases and indexes. Existing project
data is not modified by the tests.
