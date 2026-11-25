import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { ConnectionStatusIndicator } from '@/src/components/connection-status-indicator';
import { useClaimRealtimeHandler } from '@/src/features/claims/hooks/use-claim-realtime-handler';
import { useAuthStore, type User } from '@/src/features/auth/stores/use-auth-store';
import { useClaimsStore } from '@/src/features/claims/stores/use-claims-store';
import { useAdminClaimsStore } from '@/src/features/admin/stores/use-admin-claims-store';
import { useDashboardStore } from '@/src/features/admin/stores/use-dashboard-store';
import { useRealtimeStore } from '@/src/features/claims/stores/use-realtime-store';
import { FakeWebSocket } from './support/fake-websocket';
import { itKnownDefect } from './support/known-defect';
import { jsonResponse, stubBff } from './support/network';
import { CLAIM_ID, claimSummaryJson } from './support/claim-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => {
  const toastFn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toastFn };
});

const CLAIMANT: User = { userId: 'u-1', email: 'claimant@demo.com', name: 'Claimant', role: 'CLAIMANT' };
const ADMIN: User = { ...CLAIMANT, userId: 'u-2', email: 'admin@demo.com', role: 'ADMIN' };

/** Mirrors the reconnect policy in use-realtime-claim-updates: 5 retries, doubling delay capped at 16 s. */
const MAX_RETRIES = 5;
const LONGEST_RETRY_DELAY_MS = 16_000;

/** Mounts the real handler next to the real indicator, as the authenticated layout does. */
function RealtimeHarness() {
  useClaimRealtimeHandler();
  return <ConnectionStatusIndicator />;
}

const statusMessage = (type: string, claimId: string, newStatus?: string) => ({
  type, claimId, newStatus, timestamp: '2026-02-11T09:00:00Z', correlationId: 'corr-1',
});

const signInAs = (user: User) => useAuthStore.setState({ user, isAuthenticated: true });
const connectionLabel = () => screen.getByRole('status');

describe('real-time claim updates in the UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    FakeWebSocket.install();
    useClaimsStore.setState({ claims: [], isLoading: false, error: null });
    useRealtimeStore.setState({ connectionState: 'disconnected', connectionError: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useAuthStore.getState().logout();
  });

  const connect = () => {
    render(<RealtimeHarness />);
    act(() => FakeWebSocket.latest.serverOpens());
  };

  describe('connection indicator', () => {
    it('shows Live once the socket is open', () => {
      signInAs(CLAIMANT);
      connect();

      expect(connectionLabel()).toHaveAccessibleName(/live/i);
    });

    it('shows Reconnecting while it retries after the connection drops', () => {
      signInAs(CLAIMANT);
      connect();

      act(() => FakeWebSocket.latest.connectionDrops());

      expect(connectionLabel()).toHaveAccessibleName(/reconnecting/i);
    });

    it('shows Offline after the retry budget is exhausted', () => {
      signInAs(CLAIMANT);
      connect();

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        act(() => FakeWebSocket.latest.connectionDrops());
        act(() => void vi.advanceTimersByTime(LONGEST_RETRY_DELAY_MS));
      }

      expect(connectionLabel()).toHaveAccessibleName(/offline/i);
    });

    it('does not open a connection for a signed-out visitor', () => {
      render(<RealtimeHarness />);

      expect(FakeWebSocket.instances).toHaveLength(0);
    });
  });

  describe('claimant', () => {
    beforeEach(() => {
      signInAs(CLAIMANT);
      useClaimsStore.setState({
        claims: [{ ...claimSummaryJson(), incidentDate: new Date('2026-02-10'), createdAt: new Date('2026-02-11') } as never],
      });
    });

    it('sees their claim change status without reloading, and is told about it', () => {
      connect();

      act(() => FakeWebSocket.latest.serverSends(statusMessage('CLAIM_STATUS_CHANGED', CLAIM_ID.first, 'APPROVED')));

      expect(useClaimsStore.getState().claims[0].status).toBe('APPROVED');
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('APPROVED'), expect.anything());
      expect(useRealtimeStore.getState().recentlyUpdatedClaimIds.has(CLAIM_ID.first)).toBe(true);
    });

    it('ignores an update that carries an unknown status instead of corrupting the list', () => {
      connect();

      act(() => FakeWebSocket.latest.serverSends(statusMessage('CLAIM_STATUS_CHANGED', CLAIM_ID.first, 'NOT_A_STATUS')));

      expect(useClaimsStore.getState().claims[0].status).toBe('SUBMITTED');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('is not notified about other people submitting claims', () => {
      connect();

      act(() => FakeWebSocket.latest.serverSends(statusMessage('CLAIM_SUBMITTED', CLAIM_ID.second)));

      expect(toast).not.toHaveBeenCalled();
    });

    // F-10: events are fire-and-forget, so anything missed while the socket was down is never shown.
    // After reconnecting, the list should be reloaded from the server to catch up.
    itKnownDefect('F-10', 'reloads the claims list after the connection is restored', async () => {
      const bff = stubBff({ 'GET /api/claims': () => jsonResponse(200, [claimSummaryJson({ status: 'APPROVED' })]) });
      connect();
      act(() => FakeWebSocket.latest.connectionDrops());
      act(() => void vi.advanceTimersByTime(LONGEST_RETRY_DELAY_MS));

      act(() => FakeWebSocket.latest.serverOpens());

      expect(bff.callsTo('GET /api/claims').length).toBeGreaterThan(0);
    });
  });

  describe('admin', () => {
    const refreshClaims = vi.fn().mockResolvedValue(undefined);
    const refreshStats = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      signInAs(ADMIN);
      useAdminClaimsStore.setState({ fetchClaims: refreshClaims });
      useDashboardStore.setState({ fetchStats: refreshStats });
    });

    it('has the claim list and dashboard figures refreshed when a claim is submitted', () => {
      connect();

      act(() => FakeWebSocket.latest.serverSends(statusMessage('CLAIM_SUBMITTED', CLAIM_ID.second)));

      expect(refreshClaims).toHaveBeenCalledTimes(1);
      expect(refreshStats).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('New claim submitted'), expect.anything());
    });

    it('has the claim list refreshed when a status changes', () => {
      connect();

      act(() => FakeWebSocket.latest.serverSends(statusMessage('CLAIM_STATUS_CHANGED', CLAIM_ID.first, 'UNDER_REVIEW')));

      expect(refreshClaims).toHaveBeenCalledTimes(1);
    });
  });
});
