# AI-Assisted Child Development Platform

[![CI](https://github.com/YYalcinoz/SENG383-Project/actions/workflows/ci.yml/badge.svg)](https://github.com/YYalcinoz/SENG383-Project/actions/workflows/ci.yml)

SENG 383 Software Project III (Fall 2026) term project by **Team Helix**.

A web-based decision support platform that brings parents, specialists and children together around a shared weekly schedule, task list and observation record. An AI component summarizes the week's records for each reader according to their role; it supports decisions and never makes them.

> **Status: walking skeleton (v0.0).** The frontend, backend and database are connected, and their tests run in CI on every pull request. Features are added module by module (M1–M8); see `docs/PMP.md` for the plan.

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

Open http://localhost:5173 in your browser. The page should show **"Backend status: ok"**. If it shows "unreachable", check that the backend in terminal 1 is running.

## Running the tests

```bash
cd server
npm test
```

```bash
cd client
npm test
```

The same tests, plus a production build of the frontend, run automatically in GitHub Actions on every pull request.

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm install` warns about an unsupported engine, or the app fails to start | Check `node -v`; Node.js 22 or later is required. |
| The page shows "Backend status: unreachable" | Start the backend (`cd server` then `npm start`) and reload the page. |
| `Error: listen EADDRINUSE` on port 3000 | Another program (often an earlier backend that is still running) uses port 3000. Stop it and run `npm start` again; the frontend expects the backend on port 3000. |
| Vite starts on 5174 instead of 5173 | Port 5173 is in use; open the address that Vite prints in the terminal. |

## Sample data

All data is synthetic. `npm run seed` creates the database file `server/database.db` with sample users for each role (parent, specialist and child). The script can be run again safely; existing users are not duplicated. To start from an empty database, delete `server/database.db` and run `npm run seed` again.

## Configuration

Optional environment variables for the backend:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port of the backend server |
| `DB_PATH` | `server/database.db` | Path of the SQLite database file |

## Project structure

```
client/                  React frontend (Vite)
server/                  Express backend
  src/app.js             Express app and routes
  src/index.js           Starts the server
  src/db/database.js     SQLite connection and tables
  scripts/seed.js        Creates synthetic sample data
  tests/                 Jest + Supertest tests
docs/                    SRS, SDD and PMP
.github/workflows/       CI (GitHub Actions)
```

## Documentation

- [Software Requirements Specification](docs/SRS.md)
- [Software Design Document](docs/SDD.md)
- [Project Management Plan](docs/PMP.md)
- [Jira board](https://teamhelix.atlassian.net/jira/software/projects/HLX/boards/1)