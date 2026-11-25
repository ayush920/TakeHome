# Automated tests (Playwright)

Black-box tests that run against the **already running Docker Compose stack** (UI 3001, BFF 8090,
claims-service 8080, Keycloak 8180). Strategy and prioritisation: `/TEST_STRATEGY.md`.

## Run

```bash
npm ci
npm run test:api         # HTTP tests, no browser (project: api)
npm run test:e2e         # browser journeys (project: e2e)
npm run test:cleanup     # remove data the suite created (also runs automatically after a run)
QA_KNOWN_DEFECTS=fail npm run test:api   # show the real defect failures (see below)
```

Defaults match the demo accounts and ports; override with `QA_*` variables (see `support/config.ts`).

## Layout

| Path | Responsibility |
|---|---|
| `support/config.ts` | URLs, accounts, endpoints, status codes, limits (no magic values in specs) |
| `support/clients/` | `BffClient` (cookie + CSRF), `ClaimsServiceClient` (bearer), `AnonymousClient`, token helper |
| `support/claim-data.ts` | Claim builders and helpers to submit / advance claims |
| `support/fixtures.ts` | Logged-in sessions, one login per worker |
| `support/known-defect.ts` | Marks a test as exposing a documented defect |
| `api/*.api.spec.ts` | One spec per risk area |
| `e2e/global-setup.ts` / `global-teardown.ts` | Wait for the stack; remove test data |

## Known-defect tests

A test tagged with `knownDefect('F-xx', ...)` asserts the **correct** behaviour and currently fails
because of a real application bug (finding F-xx in `evidence/01-Application-Risk-Assessment.docx`).
Playwright reports it as an expected failure, so the default run is green and a fix shows up as an
"expected to fail, but passed" error, which tells you to remove the marker. Run with
`QA_KNOWN_DEFECTS=fail` to see them as ordinary failures. Caveat: an expected failure hides *why* it
failed, so the failure reasons were checked once with that switch
(`evidence/test-runs/api-known-defects-as-failures.txt`): all are assertion failures, none are
infrastructure errors.

## Test data and stability

- Everything the suite creates is prefixed `QA-AUTO` and removed in global teardown (`QA_KEEP_DATA=1` keeps it).
- The Docker VM is small. Transient connection resets are retried at transport level only
  (`TRANSPORT_RETRIES`), and login / token fetch retry a few times. HTTP error statuses are never retried.
- Tests never use a wrong password against a real demo account (Keycloak brute-force lockout).
