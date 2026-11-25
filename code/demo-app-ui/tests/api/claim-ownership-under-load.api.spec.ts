import { test, expect } from '../support/fixtures';
import { knownDefect } from '../support/known-defect';
import { buildClaimRequest, type Claim } from '../support/claim-data';
import { ENDPOINTS, HTTP } from '../support/config';
import type { BffClient } from '../support/clients/bff-client';

/**
 * Risk 2: a claim must belong to the user who submitted it, even when two users submit at the same
 * time. The BFF keeps a single shared HTTP client whose bearer token is reassigned per request
 * (finding F-03), so overlapping requests can be sent upstream with the wrong user's token.
 *
 * This is a functional concurrency check (a few dozen requests), not a load test.
 */
const SUBMISSIONS_PER_USER = 25;
/** The race is timing-dependent, so overlap is attempted over several bursts and stops at the first hit. */
const MAX_BURSTS = 4;
/** Bursts are slow on the small Docker VM, so this test gets more than the default timeout. */
const BURST_TEST_TIMEOUT_MS = 180_000;

interface Submission {
  by: BffClient;
  claim: Claim;
}

const isMisattributed = ({ by, claim }: Submission): boolean => claim.userId !== by.userId;

async function submitConcurrently(sessions: readonly BffClient[]): Promise<Submission[]> {
  const jobs = sessions.flatMap((by) =>
    Array.from({ length: SUBMISSIONS_PER_USER }, async (): Promise<Submission> => {
      const response = await by.post(ENDPOINTS.claims, buildClaimRequest());
      expect(response.status(), 'precondition: submission accepted').toBe(HTTP.CREATED);
      return { by, claim: (await response.json()) as Claim };
    }),
  );
  return Promise.all(jobs);
}

test.describe('claim ownership when two users submit at the same time', () => {
  test('every claim is stored under the user who submitted it', async ({ claimantBff, adminBff }) => {
    knownDefect('F-03', 'shared mutable bearer token in ClaimsServiceAdapter attributes claims to the wrong user');
    test.setTimeout(BURST_TEST_TIMEOUT_MS);
    const submissions: Submission[] = [];

    for (let burst = 0; burst < MAX_BURSTS && !submissions.some(isMisattributed); burst++) {
      submissions.push(...(await submitConcurrently([claimantBff, adminBff])));
    }

    const misattributed = submissions.filter(isMisattributed);
    expect(
      misattributed,
      `${misattributed.length} of ${submissions.length} claims stored under the wrong owner`,
    ).toHaveLength(0);
  });
});
