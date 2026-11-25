import { test, expect } from './support/fixtures';
import { navigate } from './support/navigation';
import { ClaimsListPage } from './pages/claims-list.page';
import { ClaimWizardPage } from './pages/claim-wizard.page';
import { buildClaimRequest, farFuture, submitClaim } from '../support/claim-data';
import { ENDPOINTS, HTTP } from '../support/config';

/** Risk 4: the money path, from the wizard through BFF and claims-service to the database and back. */
test.describe('claim submission journey', () => {
  test('a claimant submits a claim through the wizard and sees it in their list as Submitted', async ({ claimantPage, claimantBff }) => {
    const claim = buildClaimRequest();
    const wizard = new ClaimWizardPage(claimantPage);
    await wizard.open();
    await wizard.fillIncidentDetails(claim);
    await wizard.fillDescription(claim.description);
    await expect(wizard.reviewText(claim.incidentLocation)).toBeVisible();

    await wizard.submit();

    await expect(claimantPage).toHaveURL((url) => url.pathname === '/claims');
    const row = new ClaimsListPage(claimantPage).rowFor(claim.description);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Submitted');
    const stored = await (await claimantBff.get(ENDPOINTS.claims)).json();
    expect(stored.some((listed: { description: string }) => listed.description === claim.description)).toBe(true);
  });

  test('the wizard refuses an incident date in the future and explains why', async ({ claimantPage }) => {
    const claim = buildClaimRequest({ incidentDate: farFuture() });
    const wizard = new ClaimWizardPage(claimantPage);
    await wizard.open();

    await wizard.enterIncidentDetails(claim);

    await expect(claimantPage.getByRole('alert').filter({ hasText: /\S/ })).toContainText(/cannot be in the future/i);
    await expect(wizard.nextButton).toBeDisabled();
    await expect(claimantPage.getByTestId('wizard-step-1')).toBeVisible();
  });

  test('a claimant does not see claims submitted by another user', async ({ claimantPage, claimantBff, adminBff }) => {
    const ownClaim = await submitClaim(claimantBff);
    const adminClaim = buildClaimRequest();
    const created = await adminBff.post(ENDPOINTS.claims, adminClaim);
    expect(created.status()).toBe(HTTP.CREATED);
    const list = new ClaimsListPage(claimantPage);

    await list.open();

    await expect(list.rowFor(ownClaim.description)).toBeVisible();
    await expect(list.rowFor(adminClaim.description)).toHaveCount(0);
  });
});