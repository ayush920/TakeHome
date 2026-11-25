import { navigate } from '../support/navigation';
import type { Locator, Page } from '@playwright/test';

/** The claimant's "My Claims" screen. Rows are found by the unique description the test submitted. */
export class ClaimsListPage {
  readonly heading: Locator;
  readonly submitNewClaim: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'My Claims' });
    this.submitNewClaim = page.getByRole('button', { name: 'Submit New Claim' });
  }

  async open(): Promise<void> {
    await navigate(this.page, '/claims');
    await this.heading.waitFor();
  }

  rowFor(description: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByTitle(description) });
  }
}