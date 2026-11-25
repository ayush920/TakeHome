import { randomUUID } from 'node:crypto';
import { test, expect } from '../support/fixtures';
import { knownDefect } from '../support/known-defect';
import { buildClaimRequest, farFuture, submitClaim } from '../support/claim-data';
import { CLAIM_LIMITS, ENDPOINTS, HTTP, isClientError } from '../support/config';

/**
 * Risk 3: what a client actually sees when it does something wrong. A 4xx tells the user what to fix;
 * a 500 tells them nothing and looks like an outage. Findings F-05 and F-14.
 */
test.describe('claim submission through the BFF', () => {
  test('a valid claim is created and owned by the submitting user', async ({ claimantBff }) => {
    const response = await claimantBff.post(ENDPOINTS.claims, buildClaimRequest());

    expect(response.status()).toBe(HTTP.CREATED);
    const claim = await response.json();
    expect(claim.userId).toBe(claimantBff.userId);
  });

  test('an amount above the maximum is rejected with a validation error', async ({ claimantBff }) => {
    const response = await claimantBff.post(
      ENDPOINTS.claims,
      buildClaimRequest({ claimAmount: CLAIM_LIMITS.aboveMaxAmount }),
    );

    expect(response.status()).toBe(HTTP.BAD_REQUEST);
  });

  test.describe('invalid input must be a client error, not a server error', () => {
    const invalidClaims = [
      { name: 'an incident date in the future', overrides: { incidentDate: farFuture() } },
      {
        name: 'a description that is only padding around a few characters',
        overrides: { description: `${' '.repeat(6)}short${' '.repeat(6)}` },
      },
    ];

    for (const { name, overrides } of invalidClaims) {
      test(`rejects ${name}`, async ({ claimantBff }) => {
        knownDefect('F-05', 'BFF wraps every upstream 4xx in IllegalStateException and returns 500');

        const response = await claimantBff.post(ENDPOINTS.claims, buildClaimRequest(overrides));

        expect(isClientError(response.status())).toBe(true);
      });
    }
  });
});

test.describe('reading a claim through the BFF', () => {
  test('an owner can read their own claim', async ({ claimantBff }) => {
    const claim = await submitClaim(claimantBff);

    const response = await claimantBff.get(ENDPOINTS.claim(claim.claimId));

    expect(response.status()).toBe(HTTP.OK);
  });

  test('an unknown claim id returns 404', async ({ claimantBff }) => {
    knownDefect('F-05', 'upstream 404 is surfaced as a 500');

    const response = await claimantBff.get(ENDPOINTS.claim(randomUUID()));

    expect(response.status()).toBe(HTTP.NOT_FOUND);
  });

  test("another user's claim returns 403", async ({ claimantBff, adminBff }) => {
    knownDefect('F-05', 'upstream 403 is surfaced as a 500');
    const claim = await submitClaim(claimantBff);

    const response = await adminBff.get(ENDPOINTS.claim(claim.claimId));

    expect(response.status()).toBe(HTTP.FORBIDDEN);
  });
});
