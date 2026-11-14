# Project Management Plan (PMP)

**Team name:** Team Helix

| Section | Content | Required by |
|---|---|---|
| PMP-1 | Project, Jira setup, team and roles | Week 5 |
| PMP-2 | Work packages (epics) and sprint plan | Week 6 |
| PMP-3 | Progress review: mid-term (v0.1) | Week 7 |
| PMP-4 | Progress review: v0.2 | Week 8 |
| PMP-5 | Progress review: final (v1.0) | Week 10 |
| PMP-6 | Retrospective | Week 11 |

---

## PMP-1. Project and Team

### Project and Jira Setup

**Project in one sentence:** A web-based decision support platform that brings parents, specialists and children together around a shared weekly schedule, task list and observation record, with role-based AI summaries that support (but never make) decisions.  
**Jira project key:** HLX  
**Jira board link:** https://teamhelix.atlassian.net/jira/software/projects/HLX/boards/1  

The Jira space uses the Scrum template with the board columns To Do → In Progress → In Review → Done. A task is moved to Done only when its pull request is merged into `main`; a Jira automation rule does this automatically. The space has 16 epics: PMP-1 … PMP-6, M1 … M8, and SRS and DESIGN for the requirements and design documents. It is connected to the GitHub repository through the GitHub for Atlassian app, so commits, branches and pull requests that start with a Jira key (e.g. `HLX-12`) appear under the related work item.

### Team and Roles

| Name | Jira / GitHub username | Role |
|---|---|---|
| Yağız Yalçınöz | YYalcinoz | Project Manager, Developer, Tester |
| Zeynep Dila Tetik | zeynepdila76 | Developer, Tester |
| Kerem Alp Ustaoğlu | Iroveal | Developer, Tester |

---

## PMP-2. Plan

### Work Packages (Epics)

| Epic | Owner | Number of tasks | Planned sprint(s) |
|---|---|---|---|
| PMP-1 | Yağız Yalçınöz | 5 | Sprint 1 |
| PMP-2 | Yağız Yalçınöz | 1 | Sprint 2 |
| PMP-3 | Yağız Yalçınöz | 1 | Sprints 3–4 |
| PMP-4 | Yağız Yalçınöz | 0 | Sprint 5 |
| PMP-5 | Yağız Yalçınöz | 0 | Sprint 7 |
| PMP-6 | Yağız Yalçınöz | 0 | Sprint 8 |
| M1 | Yağız Yalçınöz | 19 | Sprint 2 (walking skeleton), Sprints 3–4 |
| M2 | Yağız Yalçınöz | 4 | Sprints 3–5 |
| M3 | Zeynep Dila Tetik | 5 | Sprints 3–5 |
| M4 | Kerem Alp Ustaoğlu | 3 | Sprints 4–5 |
| M5 | Zeynep Dila Tetik | 0 | Sprints 5–6 |
| M6 | Yağız Yalçınöz | 0 | Sprints 5–6 |
| M7 | Kerem Alp Ustaoğlu | 0 | Sprints 6–7 |
| M8 | Zeynep Dila Tetik | 0 | Sprints 5–7 |
| SRS | Kerem Alp Ustaoğlu | 6 | Sprint 2 (first version), Sprint 3 (remaining sections), Sprint 7 (final) |
| DESIGN | Kerem Alp Ustaoğlu | 8 | Sprint 2 (first version), Sprint 3 (remaining sections), Sprint 7 (final) |

Walking skeleton tasks are tracked under M1, as the skeleton is the foundation of the first module. Each module owner is responsible for the module and creates its tasks at the start of the sprints in which it is planned; individual tasks may be assigned to other team members. The task counts above show the state at the end of Sprint 4 and will grow accordingly.

### Sprint Plan

We use one-week sprints (Monday–Sunday) that follow the weekly course schedule.

| Sprint | Weeks | Sprint goal | Ends with |
|---|---|---|---|
| Sprint 1 | Week 4 (19–25 Oct) | Repository, CI, Jira setup and PMP-1 | PMP-1 |
| Sprint 2 | Week 5 (26 Oct–1 Nov) | Walking skeleton (v0.0), SRS and SDD first version, PMP-2 | Walking skeleton (v0.0), Week 6 class |
| Sprint 3 | Week 6 (2–8 Nov) | M1 login and roles, shared access middleware, remaining SRS and SDD sections | M1 in progress |
| Sprint 4 | Week 7 (9–15 Nov) | M1 complete; M2, M3, M4 in progress; PMP-3 | M1 complete |
| Sprint 5 | Week 8 (16–22 Nov) | M2, M3, M4 complete; first end-to-end test in CI; PMP-4 | Release v0.1 |
| Sprint 6 | Week 9 (23–29 Nov) | Mid-term demo; M5, M6 complete; M8 mock mode | Mid-term evaluation (Week 9) |
| Sprint 7 | Week 10 (30 Nov–6 Dec) | M7, M8 complete; e2e tests for 3 critical flows; SRS and SDD final; PMP-5 | Release v0.2 |
| Sprint 8 | Week 11 (7–13 Dec) | Bug fixes, an e2e test for each module, coverage ≥ 60%; PMP-6 | Release v1.0 |
| Sprint 9 | Week 12 (14–20 Dec) | Final presentation and live demo; final report | Final evaluation (Week 12) |

---

## PMP-3. Progress Review: Mid-term (v0.1)

**Jira board screenshot:**  

![Jira board at the end of Sprint 4](img/sprint4-board.png)

*Board at the end of Sprint 4 (15 Nov 2026): 10 of 13 tasks done; the two M4 pages and this PMP section were still open when the screenshot was taken.*

| Epic | Planned for this point | Status (Done / In progress / Not started) |
|---|---|---|
| PMP-2 | Work packages and sprint plan | Done |
| SRS | First version | Done |
| DESIGN | First version | Done |
| M1 | Login and roles complete | Done |
| M2 | Shared access middleware; module in progress | In progress: the middleware and every Must requirement (FR-M2-01 … FR-M2-08) are done; rate limiting and the Flow 1 end-to-end test are planned for Sprint 5 |
| M3 | In progress | Done for v0.1: the calendar events API, the weekly schedule page and the child's schedule page cover all Must requirements; the monthly view (FR-M3-06, Could) is not started |
| M4 | In progress | In progress: the tasks API is done; the tasks page and the child's "My tasks" page move to Sprint 5 |

**Quality at this point:** 325 server tests, 212 client tests and 5 end-to-end tests run in CI on every pull request. Branch coverage is 95.2% on the server and 91.9% on the client, above the 60% that NFR-05 requires for v1.0.

**Changes to the plan (if any):**

- **Delivery dates:** The course documents give different dates for the PMP sections and for the SRS and SDD. We follow the weekly plan, which has the earliest dates for the PMP sections, and the Week 6 and Week 10 dates in the SRS and SDD templates.
- **Test team:** The SENG 440 test team was cancelled, so the team tests its own work. There is no separate test task: every code pull request includes its tests, and another team member reviews it.
- **Access middleware:** `requireChildAccess` moved from M2's planned sprints to Sprint 3, because M3 and M4 depend on it.
- **Task ownership:** Module owners stay responsible for their modules, but individual tasks can be assigned to other team members.
- **Unplanned tasks from code review:** Reviews in Sprint 3 found two problems that were fixed in their own tasks: the server kept running when the database could not be opened (HLX-54), and the seed script printed a long error on Windows when the database file was in use (HLX-52). Both are tracked under M1.
- **Mid-term evaluation:** Our team is in Section 2, so the mid-term demo is in the Week 9 class. We keep v0.1 at the end of Week 8 (Sprint 5) as planned and use Week 9 only as a buffer.
- **Midterm exams in Sprint 5:** Sprint 5 falls in the midterm exam week. Its scope is limited to the Must requirements of M3 and M4 and the v0.1 release; Could requirements (monthly view, overdue label) are left for later sprints.
- **End-to-end test and coverage moved earlier:** The first end-to-end test in CI was planned for v0.1 (Sprint 5). It was added in Sprint 4 (HLX-63) together with coverage reports and a 60% branch coverage threshold in CI (HLX-64).
- **M3 ahead of plan, M4 pages in Sprint 5:** All three M3 tasks were finished in Sprint 4. The two M4 pages depend on the tasks API, which was merged at the end of Sprint 4, so they move to Sprint 5 as planned for M4.
- **Tasks table:** The `tasks` table, planned as a separate database task, was added together with the tasks API in HLX-71, since the API and its tests depend on it.
- **Jira plan and automation:** The Jira Standard trial ended, and the site was moved to the Free plan before the deadline. The "pull request merged → Done" automation still works on the Free plan.
- **Security tooling:** We enabled CodeQL code scanning and Dependabot alerts. CodeQL reported missing rate limiting on the API, which we already knew about; adding it is planned for Sprint 5. Dependabot found two issues in development-only dependencies of Jest that never run on the server; we accepted them with a written reason, since the only fix would downgrade Jest.

---

## PMP-4. Progress Review: v0.2

**Jira board screenshot:**  

| Epic | Planned for this point | Status (Done / In progress / Not started) |
|---|---|---|
| | | |
| | | |

**Changes to the plan (if any):**

---

## PMP-5. Progress Review: Final (v1.0)

**Jira board screenshot:**  

| Epic | Planned for this point | Status (Done / In progress / Not started) |
|---|---|---|
| | | |
| | | |

**Changes to the plan (if any):**

---

## PMP-6. Retrospective

- What worked well in using Jira:
- What we would do differently:
