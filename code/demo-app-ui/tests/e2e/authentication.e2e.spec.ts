import { test, expect } from './support/fixtures';
import { navigate } from './support/navigation';
import { LoginPage } from './pages/login.page';
import { ClaimsListPage } from './pages/claims-list.page';
import { knownDefect } from '../support/known-defect';
import { ACCOUNTS, STACK } from '../support/config';

const UNKNOWN_PASSWORD = 'not-the-password';
const UNKNOWN_USER_EMAIL = 'qa-auto-nobody@example.invalid';

/** Risk 6: only signed-in users reach claim screens, and the login screen behaves for both outcomes. */
test.describe('authentication journeys', () => {
  test('a claimant signs in through the login form and lands on their claims', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();

    await login.signIn(ACCOUNTS.claimant.email, ACCOUNTS.claimant.password);

    await expect(page).toHaveURL((url) => url.pathname === '/claims');
    await expect(new ClaimsListPage(page).heading).toBeVisible();
  });

  test('an admin signs in and lands on the admin dashboard', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();

    await login.signIn(ACCOUNTS.admin.email, ACCOUNTS.admin.password);

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test('unknown credentials show an error and keep the user on the login page', async ({ page }) => {
    // An address that does not exist, so no real demo account can be locked out by this test.
    const login = new LoginPage(page);
    await login.open();

    await login.signIn(UNKNOWN_USER_EMAIL, UNKNOWN_PASSWORD);

    await expect(login.error).toContainText('Invalid email or password');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a claimant who opens an admin page is turned away and returned to their own claims', async ({ claimantPage }) => {
    await navigate(claimantPage, '/admin/claims');

    await expect(claimantPage).toHaveURL((url) => url.pathname === '/claims');
    await expect(new ClaimsListPage(claimantPage).heading).toBeVisible();
  });

  test('credentials never end up in the address bar if the login form is submitted without JavaScript', async ({ browser }) => {
    knownDefect('F-12', 'the login form has no method=post, so a native submit puts email and password in the URL');
    const context = await browser.newContext({ baseURL: STACK.uiUrl, javaScriptEnabled: false });
    const page = await context.newPage();
    await navigate(page, '/login');

    await page.getByLabel('Email').fill(ACCOUNTS.claimant.email);
    await page.getByLabel('Password', { exact: true }).fill(UNKNOWN_PASSWORD);
    await page.getByRole('button', { name: 'Log In' }).click();

    expect(page.url()).not.toContain(encodeURIComponent(UNKNOWN_PASSWORD));
    await context.close();
  });

  test('a visitor who is not signed in is sent to the login page and remembers where they were going', async ({ page }) => {
    await navigate(page, '/claims');

    await expect(page).toHaveURL(/\/login\?redirect=%2Fclaims/);
  });
});