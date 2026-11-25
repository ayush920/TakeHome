import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClaimsPage from '@/app/(authenticated)/claims/page';
import { useClaimsStore } from '@/src/features/claims/stores/use-claims-store';
import { jsonResponse, stubBff } from './support/network';
import { CLAIM_ID, claimSummaryJson } from './support/claim-fixtures';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const LIST_CLAIMS = 'GET /api/claims';

const claimsTable = () => screen.findByRole('table');
const rowFor = async (claimId: string) =>
  within(await claimsTable()).getByText(claimId.substring(0, 8)).closest('tr') as HTMLElement;

describe('My Claims page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClaimsStore.setState({ claims: [], isLoading: false, error: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the claimant\'s claims, newest first, with a readable status', async () => {
    const older = claimSummaryJson({ claimId: CLAIM_ID.first, createdAt: '2026-02-01T09:00:00Z', status: 'SUBMITTED' });
    const newer = claimSummaryJson({ claimId: CLAIM_ID.second, createdAt: '2026-02-20T09:00:00Z', status: 'UNDER_REVIEW' });
    stubBff({ [LIST_CLAIMS]: () => jsonResponse(200, [older, newer]) });

    render(<ClaimsPage />);

    const table = await claimsTable();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(CLAIM_ID.second.substring(0, 8));
    expect(rows[1]).toHaveTextContent(CLAIM_ID.first.substring(0, 8));
    expect(await rowFor(CLAIM_ID.second)).toHaveTextContent('Under Review');
  });

  it('shows a loading indicator while claims are being fetched', async () => {
    let release: () => void = () => {};
    stubBff({ [LIST_CLAIMS]: () => new Promise<Response>((resolve) => { release = () => resolve(jsonResponse(200, [])); }) });

    render(<ClaimsPage />);

    expect(await screen.findByRole('status', { name: /loading claims/i })).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole('status', { name: /loading claims/i })).not.toBeInTheDocument());
  });

  it('invites the user to submit a first claim when there are none', async () => {
    stubBff({ [LIST_CLAIMS]: () => jsonResponse(200, []) });

    render(<ClaimsPage />);

    expect(await screen.findByRole('heading', { name: /no claims yet/i })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /submit your first claim/i }));
    expect(router.push).toHaveBeenCalledWith('/claims/new');
  });

  it('offers a retry that recovers after a failed load', async () => {
    const bff = stubBff({ [LIST_CLAIMS]: () => jsonResponse(500) });
    const user = userEvent.setup();
    render(<ClaimsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load claims/i);
    bff.respondWith(LIST_CLAIMS, () => jsonResponse(200, [claimSummaryJson()]));

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await claimsTable()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sends the user to the login page when the session is no longer valid (401)', async () => {
    // fetchWithAuth tries to refresh the session first; with the refresh also refused it gives up.
    stubBff({
      [LIST_CLAIMS]: () => jsonResponse(401),
      'POST /api/auth/refresh': () => jsonResponse(401),
    });
    vi.stubGlobal('location', { href: '', search: '' });

    render(<ClaimsPage />);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/login'));
  });
});
