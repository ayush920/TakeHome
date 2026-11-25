import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/(auth)/login/page';
import { useAuthStore } from '@/src/features/auth/stores/use-auth-store';
import { jsonResponse, networkFailure, stubBff } from './support/network';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const LOGIN = 'POST /api/auth/login';
const CLAIMANT = { userId: 'u-1', email: 'claimant@demo.com', name: 'Test Claimant', role: 'CLAIMANT' };
const ADMIN = { userId: 'u-2', email: 'admin@demo.com', name: 'Admin User', role: 'ADMIN' };
const VALID_PASSWORD = 'Claimant123!';

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText(/email/i), email);
  if (password) await user.type(screen.getByLabelText(/^password$/i), password);
  await user.click(screen.getByRole('button', { name: /log in/i }));
}

describe('Login page', () => {
  let location: { href: string; search: string };

  beforeEach(() => {
    useAuthStore.getState().logout();
    location = { href: '', search: '' };
    vi.stubGlobal('location', location);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['an email that is not an email', 'not-an-email', VALID_PASSWORD, /invalid email format/i],
    ['an empty password', 'claimant@demo.com', '', /password is required/i],
  ])('explains the problem and sends nothing for %s', async (_name, email, password, message) => {
    const bff = stubBff({ [LOGIN]: () => jsonResponse(200, CLAIMANT) });
    render(<LoginPage />);

    await fillAndSubmit(email, password);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(bff.callsTo(LOGIN)).toHaveLength(0);
  });

  it('shows a clear message for wrong credentials and does not sign the user in', async () => {
    stubBff({ [LOGIN]: () => jsonResponse(401, { title: 'Unauthorized' }) });
    render(<LoginPage />);

    await fillAndSubmit('claimant@demo.com', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows a network message when the server cannot be reached', async () => {
    stubBff({ [LOGIN]: networkFailure() });
    render(<LoginPage />);

    await fillAndSubmit('claimant@demo.com', VALID_PASSWORD);

    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it.each([
    ['a claimant', CLAIMANT, '/claims'],
    ['an admin', ADMIN, '/admin/dashboard'],
  ])('signs in %s and lands on their own area', async (_name, account, expectedPath) => {
    stubBff({ [LOGIN]: () => jsonResponse(200, account) });
    render(<LoginPage />);

    await fillAndSubmit(account.email, VALID_PASSWORD);

    await waitFor(() => expect(location.href).toBe(expectedPath));
    expect(useAuthStore.getState().user?.role).toBe(account.role);
  });

  it('can reveal and hide the typed password', async () => {
    render(<LoginPage />);
    const user = userEvent.setup();
    const password = screen.getByLabelText(/^password$/i);

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('tells the user when their session expired', () => {
    location.search = '?session_expired=true';
    render(<LoginPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/session has expired/i);
  });
});
