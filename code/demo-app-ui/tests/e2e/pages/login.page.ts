import { navigate } from '../support/navigation';
import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: 'Log In' });
    // Next.js keeps an empty role=alert route announcer on every page; only a message counts as an error.
    this.error = page.getByRole('alert').filter({ hasText: /\S/ });
  }

  async open(): Promise<void> {
    await navigate(this.page, '/login');
    await this.email.waitFor();
    await this.waitUntilInteractive();
  }

  /**
   * Submitting before React hydrates falls back to a native form submit (see F-12), which reloads the page
   * and puts the credentials in the URL. React marks hydrated DOM nodes with a __reactProps key, so wait for it.
   */
  private async waitUntilInteractive(): Promise<void> {
    await this.page.waitForFunction(() => {
      const form = document.querySelector('form');
      return !!form && Object.keys(form).some((key) => key.startsWith('__reactProps'));
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}