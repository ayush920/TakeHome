import { navigate } from '../support/navigation';
import type { Locator, Page } from '@playwright/test';
import type { ClaimRequest } from '../../support/claim-data';

const INCIDENT_DATE_LABEL = /when did the incident occur/i;
const LOCATION_LABEL = /where did the incident occur/i;
const AMOUNT_LABEL = /claim amount/i;

/** The three-step "submit a claim" wizard. */
export class ClaimWizardPage {
  private readonly next: Locator;

  constructor(private readonly page: Page) {
    this.next = page.getByRole('button', { name: 'Next', exact: true });
  }

  async open(): Promise<void> {
    await navigate(this.page, '/claims/new');
    await this.page.getByLabel(INCIDENT_DATE_LABEL).waitFor();
  }

  async enterIncidentDetails(claim: Pick<ClaimRequest, 'incidentDate' | 'incidentLocation' | 'claimAmount'>): Promise<void> {
    await this.page.getByLabel(INCIDENT_DATE_LABEL).fill(claim.incidentDate);
    await this.page.getByLabel(LOCATION_LABEL).fill(claim.incidentLocation);
    await this.page.getByLabel(AMOUNT_LABEL).fill(String(claim.claimAmount));
  }

  async fillIncidentDetails(claim: Pick<ClaimRequest, 'incidentDate' | 'incidentLocation' | 'claimAmount'>): Promise<void> {
    await this.enterIncidentDetails(claim);
    await this.next.click();
  }

  get nextButton(): Locator {
    return this.next;
  }

  async fillDescription(description: string): Promise<void> {
    await this.page.getByLabel(/describe what happened/i).fill(description);
    await this.next.click();
  }

  reviewText(text: string): Locator {
    return this.page.getByTestId('wizard-step-3').getByText(text);
  }

  async submit(): Promise<void> {
    await this.page.getByTestId('wizard-step-3').getByRole('button', { name: 'Submit Claim' }).click();
  }
}