# Additional findings from writing the automated tests

Continues F-01 to F-15 in `01-Application-Risk-Assessment.docx`. Found while writing and running the suites.

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-16 | High | The shipped claims-service test suite does not compile. `UpdateClaimStatusUseCase` gained an `ApplicationEventPublisher` constructor argument, but `UpdateClaimStatusUseCaseTest` still uses the old three-argument constructor, so `mvn test` fails before running a single test. Fixed minimally (one mock added) so any claims-service test can run. | `mvn test` compile error on `UpdateClaimStatusUseCaseTest.java:45` |
| F-17 | Medium | A login submitted before the page hydrates (or with JavaScript off) is a native GET form submit, so the email and password end up in the URL, browser history and server logs (`/login?email=...&password=...`). Same root cause as F-12 (no `method="post"`). | `tests/e2e/authentication.e2e.spec.ts` (known defect F-12), UI container log line `GET /login?email=...&password=...` |
| F-18 | Medium | The existing UI test suite has 8 failures on a current Node version: 6 slow-typing timeouts in `wizard-step-2.test.tsx` and 2 `use-theme-store` localStorage tests. Node 26's experimental global `localStorage` also crashed every store using zustand `persist` until a fallback was added to `tests/setup.ts`. | `evidence/test-runs/ui-full-suite-run.txt` |
| F-19 | Low | A claimant who opens `/admin/claims` first sees the admin page shell and loading skeleton before being redirected, because only cookie presence is checked in `middleware.ts`. No data is exposed (the BFF returns 403), but the guard is cosmetic. | `tests/e2e/authentication.e2e.spec.ts` |

## Test-suite findings worth knowing for the walkthrough

- Under load the browser tests show intermittent `ERR_CONNECTION_RESET` from Docker Desktop port forwarding and stalled Keycloak-backed calls (F-13). Navigation retries and longer assertion waits were added; some E2E tests may still need a re-run.
- The two JUnit helpers (`KnownDefect`) only treat *assertion* failures as the known defect, so infrastructure errors still fail the test. The Playwright and Vitest equivalents cannot make that distinction; their failure reasons were checked once by hand (`evidence/test-runs/*known-defects-as-failures.txt`).