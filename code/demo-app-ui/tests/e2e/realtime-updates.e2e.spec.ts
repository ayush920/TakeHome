import { test, expect } from './support/fixtures';
import { ClaimsListPage } from './pages/claims-list.page';
import { knownDefect } from '../support/known-defect';
import { submitClaim } from '../support/claim-data';
import { ClaimStatus, ENDPOINTS } from '../support/config';

/**
 * Risk 5: Kafka -> BFF -> WebSocket -> UI. With the shipped configuration (APP_EVENTS_CDC_ENABLED=true
 * and no Debezium running, finding F-06) no event is ever produced, so the UI never updates by itself.
 */
test.describe('real-time status updates', () => {
  test('a claimant sees their claim change status without reloading the page', async ({
    claimantPage,
    claimantBff,
    adminBff,
  }) => {
    knownDefect('F-06', 'no events flow with the shipped CDC setting, so the open page never updates');
    const claim = await submitClaim(claimantBff);
    const myClaims = new ClaimsListPage(claimantPage);
    await myClaims.open();
    await expect(myClaims.rowFor(claim.description)).toContainText('Submitted');

    await adminBff.patch(ENDPOINTS.adminClaimStatus(claim.claimId), { newStatus: ClaimStatus.UNDER_REVIEW });

    await expect(myClaims.rowFor(claim.description)).toContainText('Under Review', { timeout: 15_000 });
  });
});