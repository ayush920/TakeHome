import { test, expect } from '../support/fixtures';
import { buildClaimRequest, submitClaim } from '../support/claim-data';
import { BffClient } from '../support/clients/bff-client';
import { ENDPOINTS, HTTP } from '../support/config';

const UNKNOWN_USER_EMAIL = 'qa-auto-nobody@example.invalid';

/**
 * Risk 6: the BFF is the only door the browser uses. It must authenticate callers, keep claimants
 * out of admin functions, and refuse state-changing calls that lack the CSRF token.
 */
test.describe('BFF access control', () => {
  test('an unauthenticated caller cannot list claims', async ({ anonymousBff }) => {
    const response = await anonymousBff.get(ENDPOINTS.claims);

    expect(response.status()).toBe(HTTP.UNAUTHORIZED);
  });

  test('login with unknown credentials is rejected', async ({ playwright }) => {
    // Uses an address that does not exist: failing logins against a real demo account can trip the
    // identity provider's brute-force lockout and break every other test.
    const unknownUser = { email: UNKNOWN_USER_EMAIL, password: 'not-the-password' };

    await expect(BffClient.login(playwright, unknownUser)).rejects.toThrow(/BFF login failed/);
  });

  test.describe('a claimant session is kept out of admin functions', () => {
    const adminPaths = [ENDPOINTS.adminClaims, ENDPOINTS.adminDashboardStats];

    for (const path of adminPaths) {
      test(`claimant is forbidden from ${path}`, async ({ claimantBff }) => {
        const response = await claimantBff.get(path);

        expect(response.status()).toBe(HTTP.FORBIDDEN);
      });
    }
  });

  test('admin can reach the admin claim list', async ({ adminBff }) => {
    const response = await adminBff.get(ENDPOINTS.adminClaims);

    expect(response.status()).toBe(HTTP.OK);
  });

  test('a state-changing request without the CSRF header is refused', async ({ claimantBff }) => {
    const response = await claimantBff.postWithoutCsrf(ENDPOINTS.claims, buildClaimRequest());

    expect(response.status()).toBe(HTTP.FORBIDDEN);
  });

  test('a claimant sees their own claim in their list', async ({ claimantBff }) => {
    const claim = await submitClaim(claimantBff);

    const response = await claimantBff.get(ENDPOINTS.claims);
    const claims = (await response.json()) as Array<{ claimId: string }>;

    expect(claims.map((listed) => listed.claimId)).toContain(claim.claimId);
  });
});
