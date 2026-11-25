# Test Strategy: Claims Management Application

Companion to the risk assessment in `evidence/01-Application-Risk-Assessment.docx` (15 findings, F-01 to F-15). Finding IDs below refer to that document.

## 1. Constraints this strategy is built around

These come from the assessment brief and drive every choice below.

| Constraint (from the brief) | What it means for the suite |
|---|---|
| 2-3 h target, 5 h hard cap | Roughly 25-30 well-chosen tests, not broad coverage. Ordered by risk so the cut line is obvious. |
| "Prioritise ruthlessly"; "quality over quantity" | Every test must be able to fail. No assertion-free or always-green tests. |
| Required: component, unit and integration tests | One deliberate slice of each type (section 3). |
| Component tests from the user's perspective | Testing Library queries by role and label. No asserting on state or implementation. |
| Suite runs locally against the Docker Compose stack | Integration and E2E tests target the running stack on the published ports. One documented command per layer. |
| DRY, SOLID, clean code | Shared fixtures, API helpers and page objects. One behaviour per test. Names read as specifications. No magic strings or numbers. |
| A failing test that exposes a real defect is a strong signal | Defect tests are kept and clearly marked (section 5). They are not deleted or softened to go green. |
| Candidate signs off every test | Nothing is submitted that cannot be explained. Each test records which risk or finding it covers. |
| **Bonus (out of scope here):** load tests and visual regression | Deliberately skipped. Listed under "left out". |

## 2. Starting point: the repo is not test-free

The brief says the application has no tests. In reality the repo already contains about 37 claims-service and 35 BFF test classes (Mockito, MockMvc, ArchUnit, Testcontainers) and about 25 UI Vitest files. The Playwright scaffold exists but is incomplete (`tests/e2e/global-setup.ts` is missing, F-09).

So the plan is **not** to rewrite what exists. It is:

1. Run the existing suites first to get a baseline (pass/fail, time, coverage). *Not yet done.*
2. Add tests only where the assessment shows a real gap. Mostly these are places where the existing tests mock the very thing that is broken.
3. Say plainly in the walkthrough which tests are inherited and which are new.

## 3. Highest-risk areas and what we test

Ranked by damage if wrong. The right-hand column shows why the existing tests did not catch it.

| # | Risk area | Findings | Test type | What we assert | Why existing tests miss it |
|---|---|---|---|---|---|
| 1 | **Authorization in claims-service** (admin endpoints and user management) | F-01, F-02 | API integration (black-box, real stack) | A CLAIMANT token on :8080 gets 403 on admin claims, stats and user endpoints, and cannot create an ADMIN user | Controller tests call methods directly or mock security, so the generated self-invocation that skips `@PreAuthorize` is never exercised |
| 2 | **Claim ownership under concurrency** | F-03 | Unit (deterministic, two threads) plus one API integration | Concurrent submissions by two users are stored under the correct owner | Single-threaded mocks cannot show a shared mutable client |
| 3 | **Error mapping and status lifecycle** | F-04, F-05, F-14 | Unit on the exception handler, plus API integration | Illegal transition returns 4xx (not 500). Bad input returns 400 through the BFF. The transition matrix is exact. | Handler tests cover the exceptions that have handlers, not the one that has none |
| 4 | **Claim submission journey** (the money path) | F-05 | Component (wizard) plus E2E | Validation messages, whitespace-only description rejected, a server error produces a *specific* message, a valid claim appears in the list | Step components are tested in isolation, never through the submit failure path |
| 5 | **Real-time updates** (Kafka to BFF to WebSocket to UI) | F-06, F-10, F-11 | Unit (consumer against real Debezium-shaped payloads), component (hook and indicator), one E2E | Consumer reads the real event shape. The UI resyncs after dropped events. "Live" is not shown when nothing flows. | Consumer tests use hand-built payloads that match the code, not the producer |
| 6 | **Auth, session and role routing** | F-07, F-12 | Component (login form), E2E (role guard) | Claimant cannot reach `/admin`. Bad credentials show a clear error. Unauthenticated API returns 401. | Mostly covered by the BFF `RbacIntegrationTest`; we add only the UI-level and cross-service view |

### Test pyramid for the new tests (target counts)

| Layer | Tool | Target | Runs against |
|---|---|---|---|
| Unit (backend) | JUnit 5, Mockito | 4-6 | In-process |
| Component (UI) | Vitest, Testing Library, user-event | 6-8 | jsdom, mocked network at the boundary |
| API integration | Playwright `APIRequestContext` (TypeScript) | 8-10 | Running Compose stack |
| End-to-end (UI to DB) | Playwright | 3-4 | Running Compose stack |

API integration uses Playwright's request client rather than a new framework. It shares fixtures, login helpers and config with the E2E tests, so there is one toolchain for everything that needs the live stack (DRY).

## 4. Test design rules

- **Shared fixtures and helpers:** one place for login (per role), claim builders and API clients. E2E uses page objects for Login, Claims List, Wizard and Admin Claims.
- **No magic values:** roles, statuses, URLs and credentials come from named constants, read from environment with the demo defaults.
- **Isolation:** each test creates its own data with unique identifiers and cleans up after itself. No test depends on the order of another.
- **No arbitrary sleeps:** wait on a condition (Playwright auto-wait, Awaitility on the backend).
- **Names as specifications**, for example `claimant_cannot_list_all_claims_directly_on_claims_service`.
- **Each test is traceable:** a one-line comment names the risk or finding ID it protects.

## 5. Handling tests that expose real defects

Several planned tests are expected to fail today (for example risks 1 to 3). Rather than hiding them:

- They are written to assert the **correct** behaviour and are **tagged as known defects** with the finding ID (Playwright `test.fail()` with annotation, JUnit `@Tag("known-defect")`).
- The default run stays green and reports these as "expected failure", so a fix flips them to a visible unexpected pass.
- A single switch runs them as plain failures, which is how the defects are demonstrated live.

The reasoning is simple. A red suite hides new regressions, but a deleted defect test hides the defect. Tagging keeps both honest.

## 6. Deliberately left out

| Left out | Reason |
|---|---|
| Load/performance tests (k6) | Bonus, explicitly out of scope |
| Visual regression (Storybook/Chromatic) | Bonus, explicitly out of scope |
| Debezium/CDC pipeline end to end | Heavy infrastructure for one optional mode. Only the consumer's payload contract is tested. |
| Keycloak internals, Liquibase migrations | Third-party and already exercised by the stack starting |
| Theme picker, layout, styling | Low business risk |
| Cross-browser (Firefox/WebKit) | Chromium only, given the time cap |
| Accessibility and security scanning | Noted as next steps, not enough time to do them well |
| Re-testing what already has solid coverage (domain model, mappers, ArchUnit, CorrelationId, logging) | Duplicating it adds count, not confidence |

## 7. Order of work

Done in this order, so that cutting at any point still leaves the highest-risk coverage in place:

1. Baseline: run existing backend and UI suites, record results.
2. Shared test infrastructure: Playwright config fix (missing global setup), fixtures, API helpers.
3. API integration: risks 1, 2, 3.
4. Backend unit: exception handler gap, concurrency race, Debezium payload contract.
5. UI component: submit-error path, real-time resync, login form.
6. E2E: submit-and-view, admin transition, role guard, real-time (one test, needs `APP_EVENTS_CDC_ENABLED=false`, see F-06).
7. Commit in small, meaningful steps with the AI journal updated alongside.

## 8. Known environment risks

- The Docker VM has about 3.7 GiB for nine containers. Under load Keycloak times out and produces transient 500s (F-13). Tests must not treat these as product failures, so the stack is warmed up first and a small, bounded retry is used for the login helper only.
- The generated UI API client is git-ignored (F-09). A documented setup step (`npm run generate:api`) is required before the UI tests.
- Real-time tests need the direct-Kafka mode. The shipped default sets CDC to true with no Debezium running (F-06), so the test setup states this precondition explicitly.

## 9. Exit criteria

- Every high-risk area in section 3 has at least one test that can fail.
- All new tests pass, or are tagged as known defects with a finding ID.
- The whole suite runs from documented commands against the Compose stack.
- The author can explain each test, what it protects and what it does not.
