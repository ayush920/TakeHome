import { randomUUID } from 'node:crypto';
import { test, expect } from '../support/fixtures';
import { knownDefect } from '../support/known-defect';
import { AnonymousClient } from '../support/clients/anonymous-client';
import { ENDPOINTS, HTTP, STACK, TEST_DATA_PREFIX, UserRole } from '../support/config';

/**
 * Risk 1: claims-service must enforce authorization itself.
 * The BFF blocks admin URLs with a URL rule, but nothing protects claims-service if it is reached
 * directly (another service, a misconfigured gateway, a leaked token). Findings F-01 and F-02.
 */
test.describe('claims-service authorization (called directly with a bearer token)', () => {
  test.describe('controls: the endpoints work for the right caller', () => {
    test('admin can list every claim', async ({ adminOnClaimsService }) => {
      const response = await adminOnClaimsService.get(ENDPOINTS.adminClaims);
      expect(response.status()).toBe(HTTP.OK);
    });

    test('admin can list users', async ({ adminOnClaimsService }) => {
      const response = await adminOnClaimsService.get(ENDPOINTS.users);
      expect(response.status()).toBe(HTTP.OK);
    });

    test('claimant can list their own claims', async ({ claimantOnClaimsService }) => {
      const response = await claimantOnClaimsService.get(ENDPOINTS.claims);
      expect(response.status()).toBe(HTTP.OK);
    });
  });

  test.describe('a claimant token must not reach admin functions', () => {
    const adminOnlyReads = [
      { name: 'the list of all claims', path: ENDPOINTS.adminClaims },
      { name: 'the dashboard statistics', path: ENDPOINTS.adminDashboardStats },
      { name: 'the list of all users', path: ENDPOINTS.users },
    ];

    for (const { name, path } of adminOnlyReads) {
      test(`claimant is forbidden from reading ${name}`, async ({ claimantOnClaimsService }) => {
        knownDefect('F-01', '@PreAuthorize is bypassed by the generated controller, admin reads return 200');

        const response = await claimantOnClaimsService.get(path);

        expect(response.status()).toBe(HTTP.FORBIDDEN);
      });
    }

    test("claimant is forbidden from reading another user's profile", async ({
      claimantOnClaimsService,
      adminBff,
    }) => {
      knownDefect('F-02', 'GET /api/users/{id} has no authorization check');

      const response = await claimantOnClaimsService.get(ENDPOINTS.user(adminBff.userId));

      expect(response.status()).toBe(HTTP.FORBIDDEN);
    });

    test('claimant cannot create a user with the ADMIN role', async ({ claimantOnClaimsService }) => {
      knownDefect('F-02', 'POST /api/users accepts any role from any authenticated caller');
      const attemptedUser = {
        userId: randomUUID(),
        email: `${TEST_DATA_PREFIX.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`,
        name: `${TEST_DATA_PREFIX} escalation attempt`,
        role: UserRole.ADMIN,
      };

      const response = await claimantOnClaimsService.post(ENDPOINTS.users, attemptedUser);

      expect(response.status()).toBe(HTTP.FORBIDDEN);
    });
  });

  test('a request without a token is rejected', async ({ playwright }) => {
    const unauthenticated = await AnonymousClient.forService(playwright, STACK.claimsServiceUrl);

    const response = await unauthenticated.get(ENDPOINTS.claims);

    expect(response.status()).toBe(HTTP.UNAUTHORIZED);
    await unauthenticated.dispose();
  });
});
