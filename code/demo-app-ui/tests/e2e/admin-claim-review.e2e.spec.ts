import { test, expect } from './support/fixtures';
import { AdminClaimsPage } from './pages/admin-claims.page';
import { ClaimsListPage } from './pages/claims-list.page';
import { advanceClaim, submitClaim } from '../support/claim-data';
import { ClaimStatus, ENDPOINTS } from '../support/config';

/** Risks 3 and 6: an admin reviews a claim, and the change is real for everyone who looks afterwards. */
test.describe('admin claim review journey', () => {
  test('an admin moves a claim to Under Review and the claimant sees the new status', async ({
    adminPage,
    claimantPage,
    claimantBff,
  }) => {
    const claim = await submitClaim(claimantBff);
    const adminClaims = new AdminClaimsPage(adminPage);
    await adminClaims.open();

    await adminClaims.changeStatus(claim.claimId, 'Under Review');

    await expect(adminClaims.rowFor(claim.claimId)).toContainText('Under Review');
    const myClaims = new ClaimsListPage(claimantPage);
    await myClaims.open();
    await expect(myClaims.rowFor(claim.description)).toContainText('Under Review');
  });

  test('a closed claim offers no further status changes', async ({ adminPage, adminBff, claimantBff }) => {
    const claim = await submitClaim(claimantBff);
    await advanceClaim(adminBff, claim.claimId, [ClaimStatus.REJECTED, ClaimStatus.CLOSED]);
    const adminClaims = new AdminClaimsPage(adminPage);

    await adminClaims.open();

    await expect(adminClaims.rowFor(claim.claimId)).toContainText('Closed');
    await expect(adminClaims.statusSelect(claim.claimId)).toHaveCount(0);
  });

  test('cancelling the confirmation leaves the status unchanged', async ({ adminPage, claimantBff, adminBff }) => {
    const claim = await submitClaim(claimantBff);
    const adminClaims = new AdminClaimsPage(adminPage);
    await adminClaims.open();
    await adminClaims.statusSelect(claim.claimId).selectOption({ label: 'Under Review' });

    await adminClaims.confirmDialog().getByRole('button', { name: 'Cancel' }).click();

    await expect(adminClaims.rowFor(claim.claimId)).toContainText('Submitted');
    const stored = await (await adminBff.get(ENDPOINTS.claim(claim.claimId))).json();
    expect(stored.status).toBe(ClaimStatus.SUBMITTED);
  });
});