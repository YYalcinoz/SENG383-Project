# Software Requirements Specification (SRS)

**Team name:** Team Helix  
**Version:** ☐ First version (Week 6) ☐ Final (Week 10)  
**Last updated:** 2026-10-25

> Keep this file at `docs/SRS.md`. Keep it short and specific: every requirement should be testable.
> Requirement IDs are used in Jira tasks, commits and tests, so do not renumber them once created.
> Delete the guidance notes (lines starting with `>`) when you fill in a section.

---

## 1. Introduction

**Purpose of the system** (2–3 sentences):

**Users of the system:**

| User type | Description |
|---|---|
| | |
| | |

---

## 2. Functional Requirements

> Group requirements by module (M1–M8, same as your Jira epics). Use the format: "The system shall …".
> Priority: **Must** (required for v1.0) / **Should** (planned) / **Could** (if time allows).

### M1 – Login and roles

| ID | Requirement | Priority |
|---|---|---|
| FR-M1-01 | The system shall let a registered user log in with email and password. | Must |
| FR-M1-02 | The system shall show an error and not log the user in when the email or password is wrong. | Must |
| FR-M1-03 | The system shall issue a JWT on successful login and require a valid JWT on every protected API request. | Must |
| FR-M1-04 | The system shall take the user's role (parent, specialist or child) from the account; the user shall not choose a role at login. | Must |
| FR-M1-05 | The system shall show each role only its own screens. | Must |
| FR-M1-06 | The system shall reject API requests outside the user's role permissions. | Must |
| FR-M1-07 | The system shall let a child see only their own tasks and schedule. | Must |
| FR-M1-08 | The system shall let a logged-in user log out. | Should |

### M2 – Linking specialists

| ID | Requirement | Priority |
|---|---|---|
| FR-M2-01 | The system shall let a parent link a registered specialist to their child by entering the specialist's email and type (teacher, psychologist, doctor, special education teacher or coach). | Must |
| FR-M2-02 | The system shall show an error when the entered email does not belong to a registered specialist. | Must |
| FR-M2-03 | The system shall list the specialists linked to the child, with their name and type. | Must |
| FR-M2-04 | The system shall let a parent unlink a specialist after a confirmation step. | Must |
| FR-M2-05 | The system shall allow only the child's parent to link or unlink specialists. | Must |
| FR-M2-06 | The system shall show a specialist the list of children they are linked to. | Must |
| FR-M2-07 | The system shall give a linked specialist access to all of the child's records. | Must |
| FR-M2-08 | The system shall reject in the API every request about a child from a specialist who is not linked to that child, including a specialist who has been unlinked but still holds a valid JWT. | Must |

### M3 – Weekly schedule

| ID | Requirement | Priority |
|---|---|---|
| FR-M3-01 | | |

### M4 – Tasks

| ID | Requirement | Priority |
|---|---|---|
| FR-M4-01 | | |

### M5 – Specialist entries

| ID | Requirement | Priority |
|---|---|---|
| FR-M5-01 | | |

### M6 – Documents

| ID | Requirement | Priority |
|---|---|---|
| FR-M6-01 | The system shall let the parent and linked specialists upload a document for the child. | Must |
| FR-M6-02 | The system shall accept only PDF and image files and reject other file types. | Must |
| FR-M6-03 | The system shall list the child's documents with name, type, uploader and upload date. | Must |
| FR-M6-04 | The system shall let the parent and linked specialists view and download the child's documents. | Must |
| FR-M6-05 | The system shall not show documents to the child, in the interface or through the API. | Must |
| FR-M6-06 | The system shall reject uploads larger than 10 MB. | Should |

### M7 – Weekly statistics

| ID | Requirement | Priority |
|---|---|---|
| FR-M7-01 | | |

### M8 – Role-based AI summary

| ID | Requirement | Priority |
|---|---|---|
| FR-M8-01 | | |

---

## 3. Non-Functional Requirements

> Keep only the ones that matter for your system (3–5 is enough). Make each one measurable.

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | e.g., Pages load in under 2 seconds. |
| NFR-02 | Security | e.g., Passwords are stored hashed. |
| NFR-03 | Usability | |
| NFR-04 | | |

---

## 4. Critical Flows and Acceptance Criteria

> Choose the 3 most important user flows. Each one will have an end-to-end test (Week 10).
> Write acceptance criteria as Given / When / Then.

| Flow | Related requirements | Acceptance criteria |
|---|---|---|
| Flow 1: | FR-… | **Given** … **When** … **Then** … |
| Flow 2: | FR-… | **Given** … **When** … **Then** … |
| Flow 3: | FR-… | **Given** … **When** … **Then** … |

---

## 5. Use Case Diagram (optional)

> A simple diagram showing users and main use cases. You can use Mermaid (renders on GitHub) or add an image from `docs/img/`.

---

## 6. Change Log

| Date | Change | By |
|---|---|---|
| 2026-10-25 | Template added | Yağız Yalçınöz |
| 2026-10-28 | M1, M2 and M6 requirements added | Yağız Yalçınöz |
