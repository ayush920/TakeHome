import { test, expect } from '../support/fixtures';
import { knownDefect } from '../support/known-defect';
import { advanceClaim, submitClaim } from '../support/claim-data';
import { ClaimStatus, ENDPOINTS, HTTP, isClientError } from '../support/config';

/**
 * Risk 3: the claim status state machine is the core business rule. The expected matrix below is
 * copied from the product rule (ClaimStatus.canTransitionTo), so a change to the rule must change
 * this table deliberately.
 */
const { SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, CLOSED } = ClaimStatus;
const ALL_STATUSES = [SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, CLOSED] as const;

const ALLOWED_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  [SUBMITTED]: [UNDER_REVIEW, REJECTED],
  [UNDER_REVIEW]: [APPROVED, REJECTED, SUBMITTED],
  [APPROVED]: [CLOSED],
  [REJECTED]: [CLOSED],
  [CLOSED]: [],
};

/** Shortest legal route from a fresh (SUBMITTED) claim to each status. */
const ROUTE_FROM_SUBMITTED: Record<ClaimStatus, readonly ClaimStatus[]> = {
  [SUBMITTED]: [],
  [UNDER_REVIEW]: [UNDER_REVIEW],
  [APPROVED]: [UNDER_REVIEW, APPROVED],
  [REJECTED]: [REJECTED],
  [CLOSED]: [REJECTED, CLOSED],
};

const transitions = ALL_STATUSES.flatMap((from) =>
  ALL_STATUSES.map((to) => ({ from, to, allowed: ALLOWED_TRANSITIONS[from].includes(to) })),
);
const allowedTransitions = transitions.filter((transition) => transition.allowed);
const forbiddenTransitions = transitions.filter((transition) => !transition.allowed);

/** A few forbidden moves are enough to prove "a refused change leaves the claim untouched". */
const REPRESENTATIVE_FORBIDDEN = [
  { from: SUBMITTED, to: APPROVED },
  { from: APPROVED, to: REJECTED },
  { from: CLOSED, to: SUBMITTED },
] as const;

test.describe('claim status lifecycle (admin, through the BFF)', () => {
  test('a new claim starts as SUBMITTED', async ({ claimantBff }) => {
    const claim = await submitClaim(claimantBff);

    expect(claim.status).toBe(SUBMITTED);
  });

  test.describe('allowed transitions are applied', () => {
    for (const { from, to } of allowedTransitions) {
      test(`${from} -> ${to}`, async ({ claimantBff, adminBff }) => {
        const claim = await submitClaim(claimantBff);
        await advanceClaim(adminBff, claim.claimId, ROUTE_FROM_SUBMITTED[from]);

        const response = await adminBff.patch(ENDPOINTS.adminClaimStatus(claim.claimId), { newStatus: to });

        expect(response.status()).toBe(HTTP.OK);
        expect((await response.json()).status).toBe(to);
      });
    }
  });

  test.describe('forbidden transitions are refused with a client error', () => {
    for (const { from, to } of forbiddenTransitions) {
      test(`${from} -> ${to}`, async ({ claimantBff, adminBff }) => {
        knownDefect('F-04', 'InvalidStatusTransitionException has no handler, so the API answers 500');
        const claim = await submitClaim(claimantBff);
        await advanceClaim(adminBff, claim.claimId, ROUTE_FROM_SUBMITTED[from]);

        const response = await adminBff.patch(ENDPOINTS.adminClaimStatus(claim.claimId), { newStatus: to });

        expect(isClientError(response.status())).toBe(true);
      });
    }
  });

  test.describe('a refused transition leaves the claim unchanged', () => {
    for (const { from, to } of REPRESENTATIVE_FORBIDDEN) {
      test(`${from} -> ${to}`, async ({ claimantBff, adminBff }) => {
        const claim = await submitClaim(claimantBff);
        await advanceClaim(adminBff, claim.claimId, ROUTE_FROM_SUBMITTED[from]);

        await adminBff.patch(ENDPOINTS.adminClaimStatus(claim.claimId), { newStatus: to });

        const reloaded = await claimantBff.get(ENDPOINTS.claim(claim.claimId));
        expect((await reloaded.json()).status).toBe(from);
      });
    }
  });

  test('a claimant cannot change a claim status', async ({ claimantBff }) => {
    const claim = await submitClaim(claimantBff);

    const response = await claimantBff.patch(ENDPOINTS.adminClaimStatus(claim.claimId), {
      newStatus: UNDER_REVIEW,
    });

    expect(response.status()).toBe(HTTP.FORBIDDEN);
  });
});
