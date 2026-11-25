import { navigate } from '../support/navigation';
import type { Locator, Page } from '@playwright/test';

const SHORT_ID_LENGTH = 8;

/** The admin's claims table, where a claim's status is changed through a confirmation dialog. */
export class AdminClaimsPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await navigate(this.page, '/admin/claims');
    await this.page.getByRole('heading', { name: /claims/i }).first().waitFor();
  }

  rowFor(claimId: string): Locator {
    return this.page.getByRole('row').filter({ hasText: claimId.substring(0, SHORT_ID_LENGTH) });
  }

  /** The status dropdown in the claim's row (the page also renders a card layout, so scope to the table). */
  statusSelect(claimId: string): Locator {
    return this.page.getByRole('table').getByTestId(`status-select-${claimId.substring(0, SHORT_ID_LENGTH)}`);
  }

  confirmDialog(): Locator {
    return this.page.getByRole('dialog');
  }

  /** Picks a new status from the claim's dropdown and confirms the dialog. */
  async changeStatus(claimId: string, statusLabel: string): Promise<void> {
    await this.statusSelect(claimId).selectOption({ label: statusLabel });
    await this.confirmDialog().getByRole('button', { name: 'Confirm' }).click();
  }
}