# AI-Assisted Child Development Platform

[![CI](https://github.com/YYalcinoz/SENG383-Project/actions/workflows/ci.yml/badge.svg)](https://github.com/YYalcinoz/SENG383-Project/actions/workflows/ci.yml)

SENG 383 Software Project III (Fall 2026) term project by **Team Helix**.

A web-based decision support platform that brings parents, specialists and children together around a shared weekly schedule, task list and observation record. An AI component summarizes the week's records for each reader according to their role; it supports decisions and never makes them.

> **Status: v0.1 (mid-term release).** Modules M1–M4 are ready: login and roles, linking specialists, the weekly schedule and tasks. Modules M5–M8 are not started yet. The frontend, backend and database are connected, and their tests run in CI on every pull request. Released versions are listed on the [Releases page](https://github.com/YYalcinoz/SENG383-Project/releases); see `docs/PMP.md` for the plan.

## Modules

| Module | Status | What you can do |
|---|---|---|
| M1 – Login and roles | Ready | Log in with email and password and log out. Parents, specialists and children each see only their own screens. |
| M2 – Linking specialists | Ready | A parent links a registered specialist to their child by email and unlinks them after a confirmation step. A specialist sees the children linked to them. |
| M3 – Weekly schedule | Ready | Parents and linked specialists see a child's week and add events. A child sees their own schedule. |
| M4 – Tasks | Ready | Parents and linked specialists assign tasks and see their status. A child sees their own tasks and marks them as done. |
| M5 – Specialist entries | Not started | |
| M6 – Documents | Not started | |
| M7 – Weekly statistics | Not started | |
| M8 – Role-based AI summary | Not started | |

The monthly view (FR-M3-06) and the "Overdue" label (FR-M4-09) are "Could" requirements and are not part of v0.1.

## Team

| Name | Role | GitHub |
|---|---|---|
| Yağız Yalçınöz | Project Manager, Developer, Tester | [@YYalcinoz](https://github.com/YYalcinoz) |
| Zeynep Dila Tetik | Developer, Tester | [@zeynepdila76](https://github.com/zeynepdila76) |
| Kerem Alp Ustaoğlu | Developer, Tester | [@Iroveal](https://github.com/Iroveal) |

## Requirements

- [Node.js](https://nodejs.org/) **22 or later** (check with `node -v`)
- npm (comes with Node.js)
- Git

No database server, Docker or cloud account is needed: the database is a local SQLite file. The commands below work the same in a Linux/macOS terminal and in Windows PowerShell or Git Bash.

## Installation

```bash
git clone https://github.com/YYalcinoz/SENG383-Project.git
cd SENG383-Project
```

Install the backend and create the database with sample data:

```bash
cd server
npm install
npm run seed
cd ..
```

Install the frontend:

```bash
cd client
npm install
cd ..
```

## Running the application

The backend and the frontend run in two separate terminals.

**Terminal 1, backend** (http://localhost:3000):

```bash
cd server
npm start
```

**Terminal 2, frontend** (http://localhost:5173):

```bash
cd client
npm run dev
```

Open http://localhost:5173 in your browser. The login page should open. Log in with one of the [demo accounts](#demo-accounts) below (password `password123`). If the page says "Cannot reach the server", check that the backend in terminal 1 is running.

**Login limit:** after 10 failed login attempts from the same IP address, login is blocked for 15 minutes; successful logins are not counted. The counters are kept in memory, so restarting the backend resets them. While you develop, all browsers on your machine share one IP address, so mistyped passwords of different users add up. Linking a specialist (20 failed attempts per parent), uploading documents (20 uploads per user) and the API as a whole (1000 requests per IP address) have limits too, each per 15 minutes.

## Running the tests

Unit and API tests:

```bash
cd server
npm test
```

```bash
cd client
npm test
```

Add `:coverage` (`npm run test:coverage`) to also measure test coverage; the HTML report is written to `coverage/index.html` in the same folder. The tests fail if branch coverage drops below 60% (NFR-05).

Linter (oxlint), in `server` or `client`:

```bash
npm run lint
```

The server linter also fails on warnings, so warnings never pile up.

End-to-end tests (Playwright) start the backend and the frontend themselves and log in through a real browser:

```bash
cd e2e
npm install
npx playwright install chromium   # once; on Linux/WSL use --with-deps if the browser fails to start
npm test
```

They use their own database file (`e2e/.data/e2e.db`) and ports (3100 and 5180), so they never touch `server/database.db` and can run while the app is running on 3000 and 5173. After a failure, `npm run report` opens a report with a trace of each step.

The tests share one seeded database that is not reset between tests. A test that changes data must either undo its change or use data that no other test relies on; see the note in `e2e/playwright.config.js` for which seed accounts are free to change.

In GitHub Actions, every pull request runs the server and client linters, the server and client tests with coverage, a production build of the frontend and the end-to-end tests. The coverage table appears in the summary of the CI run, and the HTML reports can be downloaded from the run's artifacts.

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm install` warns about an unsupported engine, or the app fails to start | Check `node -v`; Node.js 22 or later is required. |
| The login page says "Cannot reach the server" | Start the backend (`cd server` then `npm start`) and reload the page. |
| The login page says "Too many failed login attempts, please try again in 15 minutes" | Wait 15 minutes, or stop the backend and run `npm start` again to reset the counter. |
| `Error: listen EADDRINUSE` on port 3000 | Another program (often an earlier backend that is still running) uses port 3000. Stop it and run `npm start` again; the frontend expects the backend on port 3000. |
| Vite starts on 5174 instead of 5173 | Port 5173 is in use; open the address that Vite prints in the terminal. |

## Sample data

All data is synthetic. `npm run seed` creates the database file `server/database.db` with three families (a parent and a child each) and three specialists. The third family, Selin and Deniz Kaya, has demo calendar events and tasks in the current week and the next week, counted from the day the seed runs, so the pages are never empty during a demo. The script deletes any existing database file first, so it always builds the current schema with the same sample data. Run it again after pulling changes to the schema. Anything added through the application is lost, and the backend must be stopped first, because a running server keeps using the deleted file.

### Demo accounts

All accounts are synthetic and do not belong to real people. Every account uses the password `password123`.

| Name | Email | Role | Linked to |
|---|---|---|---|
| Ayşe Yılmaz | ayse@example.com | parent | Parent of Zeynep |
| Zeynep Yılmaz | zeynep@example.com | child | Child of Ayşe |
| Fatma Şahin | fatma@example.com | parent | Parent of Ali |
| Ali Şahin | ali@example.com | child | Child of Fatma |
| Mehmet Demir | mehmet@example.com | specialist | Linked to Zeynep as a teacher |
| Elif Arslan | elif@example.com | specialist | Not linked to any child |
| Selin Kaya | selin@example.com | parent | Parent of Deniz |
| Deniz Kaya | deniz@example.com | child | Child of Selin |
| Burak Öztürk | burak@example.com | specialist | Linked to Deniz as a psychologist |

**For a demo**, log in as Selin, Deniz or Burak: Deniz has events and tasks this week and next week, some of them done. The other accounts have no events or tasks. Because the dates are counted from the day the seed runs, run `npm run seed` again on the day of the demo.

For testing access control:

- Mehmet is linked to Zeynep only, so he must not see Ali's or Deniz's data. Burak is linked to Deniz only.
- Elif is not linked to any child, so she must not see any child's data until a parent links her. To try linking a specialist, log in as a parent and link Elif by her email.
- Each parent sees only their own child: Fatma must not see Zeynep's data, Ayşe must not see Ali's, and neither of them sees Deniz's.
- A child sees only their own tasks and schedule.

## Configuration

Optional environment variables for the backend (copy `server/.env.example` to `server/.env` to set them):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port of the backend server |
| `DB_PATH` | `server/database.db` | Path of the SQLite database file |
| `UPLOAD_DIR` | `server/uploads` | Folder where uploaded documents are stored |
| `JWT_SECRET` | random on each start | Secret that signs login tokens; without it, users are logged out when the server restarts |

## Project structure

```
client/                  React frontend (Vite)
  src/pages/             One page per screen, with its tests
  src/components/        Shared components (page layout, child list, module list, loading, week days)
  src/auth/              Login state and protected routes
  src/hooks/             Shared hooks (finding a child in the user's list)
  src/utils/             Helpers for dates, tasks and events
server/                  Express backend
  src/app.js             Express app: middleware, routers and the error handler
  src/index.js           Starts the server
  src/config.js          Reads the settings from .env
  src/routes/            One router per module (auth, children, specialists, schedule, tasks, documents)
  src/middleware/        Login, role and child access checks; rate limits
  src/utils/             Week and date helpers
  src/db/                SQLite connection, tables and query helpers
  scripts/               Seed data (seed.js) and database reset (resetDatabase.js)
  tests/                 Jest + Supertest tests
e2e/                     Playwright end-to-end tests
docs/                    SRS, SDD and PMP
.github/workflows/       CI (GitHub Actions)
```

## Documentation

- [Software Requirements Specification](docs/SRS.md)
- [Software Design Document](docs/SDD.md)
- [Project Management Plan](docs/PMP.md)
- [Releases](https://github.com/YYalcinoz/SENG383-Project/releases)
- [Jira board](https://teamhelix.atlassian.net/jira/software/projects/HLX/boards/1)