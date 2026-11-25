# AI Working Journal: Claims Management QA Take-Home

Tool: Claude Code in VS Code (Claude Sonnet 5.5). Repo: https://github.com/ayush920/TakeHome

## The 60-second version

| Step | What I asked for | Result |
|---|---|---|
| 1 | Set up the repo, push, audit and install dependencies | Repo on GitHub; JDK 21, Maven, Docker ready |
| 2 | **Assess before testing** (read the source, run the app, find risk) | 15-finding risk assessment (Word, with screenshots), later 19 |
| 3 | Test strategy from the brief's constraints | `TEST_STRATEGY.md`: risk-to-test map, what is left out |
| 4 | API integration tests (Playwright) | 64 tests, 36 of them expose real defects |
| 5 | Component tests (Testing Library) | 33 tests, real stores and API client, only the network faked |
| 6 | End-to-end browser tests (Playwright) and JUnit tests | 13 journeys, 3 JUnit classes |
| 7 | Challenges and overrides | See "Where I challenged or overrode the AI" |

**Headline findings to lead with:** F-03 (claims saved under the wrong user under concurrency), F-01/F-02 (claims-service does not enforce roles), F-06 (real-time updates never fire by default), F-04/F-05 (illegal transitions and bad input answer 500), F-16 (the shipped claims-service tests do not compile).

**How the suite handles real defects:** a test that exposes a bug asserts the *correct* behaviour and is tagged with the finding ID (`knownDefect('F-xx')`). The default run stays green and shows these as expected failures; setting `QA_KNOWN_DEFECTS=fail` (or `-Dqa.knownDefects=fail` for JUnit) shows the raw failures. A fix turns the tag into a visible "now passes, remove the marker".

---

## Prompt log

### 1. Repository setup
**Prompt:** Initialize this repo here: https://github.com/ayush920/TakeHome and create a first commit in which you commit the current code. Add a message "Initial App Code Commit"

**AI did:** initialised git, committed with the requested message, scanned the staged files and pointed out that `docker/compose/.env` (dev defaults only) was included, then stopped before pushing because a push is outward-facing.

**My call:** accepted. Explicit target, message and scope left nothing to guess.

### 2. Push
**Prompt:** The branch is already there on github. Just push the changes

**AI did:** fetched and found the remote already had an unrelated one-line README commit. It rebased onto it instead of force-pushing, kept the app's README, and pushed (`789ec28..8d90822`).

**My call:** I supplied the missing fact; the AI chose the non-destructive route.

### 3. Dependency audit
**Prompt:** Now I want you to go through the application code and tell me exactly what dependencies need to be installed in order to launch the application. Check my system and see which are not there and give me the ones that need to be installed

**AI did:** derived the requirements from the README, poms, Dockerfiles and scripts (JDK 21, Maven 3.9+, Node 20+, Docker, bash), checked the machine, and returned a table of required / present / missing. Installed nothing yet.

**My call:** accepted. I asked for an audit grounded in the code and the machine, and kept "tell me" separate from "do it".

### 4. Install
**Prompt:** yes, run the winget installs

**AI did:** installed what winget offered. Maven is not in winget, so it downloaded Apache Maven 3.9.16 and verified its SHA-512 against Apache's checksum. It left the elevated WSL install to me.

**My call:** accepted the deviation because it told me why the plan changed.

### 5. Assess the application before writing any test
**Prompt:** Now I will come to the main task. We need to complete a take home assignment. The assignment details are given in this word document: "...V1_Chubb_APAC_Take-Home_Assessment_QA.docx". You should be able to access it. We will complete the implementation in a planned manner in chunks and not all at once. Go through the entire document to understand what needs to be done.

1. The first part of the task is to assess the application. Assess the application. Before writing a single test, read the source code and understand how the application works. Form a view on where the highest-risk areas are, where a defect would cause the most damage, where the logic is most complex, and where the integration points between layers are most brittle. Document your assessment, however briefly.

I have launched the application. All you need to do is create a word document with your findings as requested in the above point. Make sure that your findings are relevant and as expected. Add screenshots as well in the word doc for whatever points you are giving. Save the word document in the repo under a new folder called evidence. Name the doc appropriately. Once that is done let me know, I will assign the next task.

**AI did:** read the source of all three tiers, then ran the stack and tried to break it: scripted API probes, a 40-request concurrency probe, a real browser for screenshots, database and Kafka checks. Produced `evidence/01-Application-Risk-Assessment.docx` with re-runnable probe scripts and raw output.

**Worth saying:** every finding is tagged Executed (reproduced) or Code review (only read). Traced the "admin endpoints are open" result to its root cause (a generated controller calls itself, so `@PreAuthorize` never runs) instead of reporting only the symptom. Treated intermittent 500s as environmental (Keycloak timeouts on a small Docker VM), not as an app bug.

**My call:** accepted, and fixed the order of work: assessment first, tests second.

### 6. Commit the first round
**Prompt:** Now I want you to commit only the evidence and code for this first round of testing that we did. Only commit this and add commit message "Initial Code Testing"

**AI did:** staged only `evidence/` (33 files, commit `b3bd87f`), left build output and unrelated changes out, and did not push.

**My call:** accepted. The word "only" set a hard scope.

### 7. Test strategy
**Prompt:** Now we will begin the rest of the implementation. Go through the entire word document and gain an understanding of the complete picture. Then I want you to first create a small writeup about the Test Strategy. Create a .md file for it and save it in the current repo. It should cover whatever validations we plan to include in our test suite. As its mentioned already that covering everything will be difficult so I want you to keep in mind whatever is mentioned as constraints/notes in the word document. We can skip the performance tests that are marked as Bonus.

**AI did:** re-read the brief and checked what tests already exist before planning. That contradicted the brief's "no tests": there are about 37 claims-service, 35 BFF and 25 UI test files. So the strategy adds tests only where the assessment found gaps (mostly where existing tests mock the thing that is broken). Wrote `TEST_STRATEGY.md`: constraints table, risk-to-test map tied to finding IDs, target counts per layer, rules for tests that expose defects, what is left out, order of work, exit criteria.

**My call:** accepted. Two decisions I confirmed: tag defect tests instead of deleting or skipping them, and use Playwright's API client for integration tests so API and browser tests share one toolchain.

### 8. Push evidence and strategy commits
**Prompt:** First I want you to push the commit for evidence. The change is not yet visible on github. Then I want you to make a new commit called "Developed Test Strategy" and it should contain all the test strategy code only

**Prompt:** Push the strategy commit to github and make sure its pushed to remote

**AI did:** pushed `b3bd87f`, committed only `TEST_STRATEGY.md` as `f6c7e09`, pushed it, and checked that local and remote hashes matched.

### 9. Playwright API integration tests (risks 1, 2, 3, 6)
**Prompt:** Now complete the setup of the rest of the tests. Write tests for components mentioned in the document one by one. First cover one set of components, write its tests, run them, get results, then push the code to github with appropriate commit messages. Skip the load testing test cases. The second part of the task should be covered here: 2. Add tests where they matter most. Based on your assessment, implement a variety of tests that give meaningful confidence in the application. You will not have time to test everything — that is by design. Decide what to test and what to leave out, and be prepared to explain that prioritisation. Write tests in Playwright. Make sure you follow all the instructions from the word document. Follow the principles as highlighted.

**AI did:** built shared infrastructure (config constants, typed clients for the BFF with CSRF, claims-service with a bearer token and anonymous callers, claim builders, worker-scoped login fixtures, a `knownDefect()` marker, the missing `global-setup`, a data-cleanup teardown). Wrote 64 API tests in 6 specs, one per risk area: 28 passing controls and 36 known-defect tests. Ran them twice, then ran them with the defects shown as real failures and confirmed all 36 are assertion failures. Four commits, pushed.

**Worth saying:** the first draft had problems I fixed before committing: a race test that passed by luck (now repeated bursts), a wrong-password test that could lock a real account (now an unknown address), and test data that had grown to 1,165 claims and slowed the stack (now removed after every run).

**My call:** accepted after review.

### 10. Component tests with Testing Library
**Prompt:** Yeah use the testing library. [...] Also commit whatever has been done until now with an appropriate commit message. make sure its pushed to remote

**AI did:** wrote 33 component tests in 4 files (claim submission, claims list, login, real-time updates). They use the real Zustand stores and the generated API client, with only `fetch` and `WebSocket` faked, and assert what the user sees. Found two more real defects while writing them: a description of only spaces is accepted (F-05) and the UI does not reload claims after a reconnect (F-10). Ran the full existing UI suite as a baseline: 291 pass, 8 fail (not caused by the new tests). Added an in-memory `localStorage` fallback in `tests/setup.ts` because Node 26's global crashed every store using `persist`. Committed in logical steps and pushed.

**My call:** I chose Testing Library for components because the brief names it; Playwright covers API and browser tests.

### 11. End-to-end browser tests, then JUnit
**Prompt:** commit whatever is done until now, then do the end to end then Junit

**Prompt (after a long, flaky E2E run):** Its fine if the tests are failing. I want you to complete the development so I can share the code

**AI did:** wrote 13 browser journeys with page objects and signed-in browser fixtures (session cookies from an API login, so journeys do not each pay for a login): authentication and route guard, claim submission, admin review, real-time updates. Added retrying navigation, route warm-up, a 30-second assertion timeout and one retry. Then wrote 3 JUnit classes with a `@KnownDefect` marker that treats only assertion failures as the defect: exception-handler coverage (F-04), a concurrency test of the BFF's shared token against the real generated client (F-03), and a Debezium payload contract test (F-11). Running the first JUnit test revealed that the shipped claims-service test suite does not compile (F-16). Wrote up F-16 to F-19.

**Worth saying:** the browser tests are sensitive to the small Docker VM (about 3.7 GiB for nine containers), so some fail or time out intermittently. That is documented in `tests/README.md`; the API and component suites are the stable evidence.

**My call (override):** the AI wanted to keep stabilising the browser tests. I told it to stop and ship with the limitation documented.

---

## Where I challenged or overrode the AI

These are the follow-up directions I gave, and what changed because of them.

**A. Expected failures can hide the wrong failure.**
Prompt: "You marked 36 tests as expected failures. How do I know they fail for the reason you claim and not because Keycloak timed out? Prove it before I sign these off."
Result: re-ran everything with the defects shown as real failures and checked each reason. Three hidden infrastructure errors were found and fixed. Output is in `evidence/test-runs/`.

**B. A flaky test is worse than no test.**
Prompt: "The concurrency test passed once and failed once. A race test that is green by luck is worse than none. Make it deterministic or drop it."
Result: the test now sends repeated bursts and stops at the first misattributed claim, with a longer timeout. It reproduces on every run.

**C. Check what already exists.**
Prompt: "The brief says the app has no tests, but I can see hundreds. Check what exists before writing anything, and tell me which of your tests are new value rather than duplicates."
Result: the inventory showed about 100 existing test classes. New tests were limited to gaps: real HTTP against the running stack, and real stores with a faked network.

**D. Never weaken an assertion to get green.**
Prompt: "Do not delete or loosen an assertion to get green. If the app is wrong the test stays and is labelled with the finding ID."
Result: defect tests assert the correct behaviour and carry the finding ID. A fix makes them fail with "expected to fail but passed".

**E. Test isolation.**
Prompt: "My claimant account got locked out after your login test. Make sure no test can lock a shared account or leave data behind."
Result: the bad-credentials test now uses an address that does not exist, and a global teardown removes everything the suite created (prefix `QA-AUTO`).

**F. Is it my setup or the repo?**
Prompt: "Half of the existing UI tests crash on my machine. Is that my setup or the repo? Do not silently fix what you do not understand."
Result: traced to Node 26's global `localStorage` shadowing jsdom's. A small, documented fallback was added. The 8 remaining failures are reported as the baseline, not hidden.

---
