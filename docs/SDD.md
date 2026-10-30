# Software Design Document (SDD)

**Team name:** Team Helix  
**Version:** ☐ First version (Week 6) ☐ Final (Week 10)  
**Last updated:** 2026-10-25

> Keep this file at `docs/SDD.md`. Describe how the system is built; the SRS describes what it does.
> Diagrams can be written in Mermaid (renders directly on GitHub) or added as images from `docs/img/`.
> Delete the guidance notes (lines starting with `>`) when you fill in a section.

---

## 1. Architecture Overview

> Describe the overall structure in 2–3 sentences (e.g., client–server, layered, frontend + REST API + database) and add one diagram.

```mermaid
flowchart LR
    User --> Frontend
    Frontend --> Backend["Backend / API"]
    Backend --> DB[(Database)]
```

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Node.js + Express, JWT authentication |
| Database | SQLite |
| Testing | Jest + Supertest (backend), Vitest (frontend), Playwright (end-to-end) |
| CI | GitHub Actions |

---

## 2. Module Design

> One row per module (M1–M8, same as your SRS and Jira epics). Name the main components (classes, services, pages) that implement each module.

| Module | Main components | Implements requirements |
|---|---|---|
| M1 – Login and roles | Backend: `routes/auth.js` (login, current user), `middleware/auth.js` (`authenticate`, `requireRole`), bcryptjs for password hashing, jsonwebtoken. Frontend: `LoginPage`, `AuthContext` (keeps the token and the current user), `ProtectedRoute` (role-based routing) | FR-M1-01 … FR-M1-08 |
| M2 – Linking specialists | Backend: `routes/children.js` (children of the current user), `routes/specialists.js` (link, list, unlink), `middleware/childAccess.js` (`requireChildAccess`). Frontend: `LinkedSpecialistsPage` (parent), `MyChildrenPage` (specialist) | FR-M2-01 … FR-M2-08 |
| M3 – Weekly schedule | | |
| M4 – Tasks | | |
| M5 – Specialist entries | | |
| M6 – Documents | Backend: `routes/documents.js` (upload, list, download), multer (file type check and 10 MB limit), files stored in `server/uploads/`. Frontend: `DocumentsPage` | FR-M6-01 … FR-M6-06 |
| M7 – Weekly statistics | | |
| M8 – Role-based AI summary | | |

### Access control

Every protected request passes through three middleware functions:

1. `authenticate` verifies the JWT and puts the user (id, role) on the request; a missing or invalid token returns 401.
2. `requireRole(...roles)` returns 403 if the user's role is not allowed for the endpoint.
3. `requireChildAccess` checks, on every request and against the database, that the user may access the child in the URL: a parent must be the child's parent, a specialist must have a row in `specialist_links`, and a child may only access their own data. Because the link is checked in the database and not in the token, an unlinked specialist is rejected even while their JWT is still valid (FR-M2-08).

All child-related endpoints use the prefix `/api/children/:childId/...`, so the same check applies to every module.

The JWT is signed with `JWT_SECRET` from `.env`, expires after 2 hours and is kept in the browser's localStorage. localStorage is readable by JavaScript, so an XSS bug could expose the token; we accept this for simplicity and reduce the risk by relying on React's default escaping (no `dangerouslySetInnerHTML`) and the short expiry.

---

## 3. Data Model

> Main entities and their relationships. A simple ER diagram is enough.

```mermaid
erDiagram
    USERS ||--o{ USERS : "parent of"
    USERS ||--o{ SPECIALIST_LINKS : "child"
    USERS ||--o{ SPECIALIST_LINKS : "specialist"
    USERS ||--o{ DOCUMENTS : "child"
    USERS ||--o{ DOCUMENTS : "uploaded by"
    USERS {
        int id PK
        string name
        string email UK
        string password_hash
        string role "parent, specialist or child"
        int parent_id FK "set only for children"
    }
    SPECIALIST_LINKS {
        int id PK
        int child_id FK
        int specialist_id FK
        string specialist_type "teacher, psychologist, doctor, special education teacher or coach"
        datetime created_at
    }
    DOCUMENTS {
        int id PK
        int child_id FK
        int uploader_id FK
        string original_name
        string stored_name "random name on disk"
        string mime_type
        int size_bytes
        datetime uploaded_at
    }
```

- A child is a user with the role `child`; `parent_id` links the child to their parent. A parent can have more than one child, and each child has one parent.
- `(child_id, specialist_id)` is unique in `specialist_links`, so a specialist cannot be linked to the same child twice. Unlinking deletes the row.
- Uploaded files are stored on disk under a random name, so user-supplied file names are never used as paths.

---

## 4. API / Interfaces

> List the main endpoints or interfaces between components. Skip this section if your system has no API.

| Method | Endpoint | Description | Module |
|---|---|---|---|
| POST | `/api/auth/login` | Log in with email and password, returns a JWT and the user | M1 |
| GET | `/api/auth/me` | Current user (id, name, role) | M1 |
| GET | `/api/children` | Children of the current parent, or children linked to the current specialist | M2 |
| GET | `/api/children/:childId/specialists` | List specialists linked to the child | M2 |
| POST | `/api/children/:childId/specialists` | Link a specialist by email and type (parent only) | M2 |
| DELETE | `/api/children/:childId/specialists/:specialistId` | Unlink a specialist (parent only) | M2 |
| GET | `/api/children/:childId/documents` | List the child's documents | M6 |
| POST | `/api/children/:childId/documents` | Upload a PDF or image (max 10 MB) | M6 |
| GET | `/api/children/:childId/documents/:documentId/download` | Download a document | M6 |

---

## 5. Critical Flows

> Use the same 3 critical flows as SRS Section 4. Add one sequence diagram for each.

### Flow 1:

```mermaid
sequenceDiagram
    actor User
    User->>Frontend: action
    Frontend->>Backend: request
    Backend->>Database: query
    Database-->>Backend: result
    Backend-->>Frontend: response
    Frontend-->>User: result shown
```

### Flow 2:

### Flow 3:

---

## 6. User Interface

> Add sketches or screenshots of the main screens (hand-drawn wireframes are fine).

| Screen | Image | Module |
|---|---|---|
| | `docs/img/…` | |

---

## 7. Change Log

| Date | Change | By |
|---|---|---|
| 2026-10-25 | Template added | Yağız Yalçınöz |
| 2026-10-29 | M1, M2 and M6 design, data model and access control added | Yağız Yalçınöz |