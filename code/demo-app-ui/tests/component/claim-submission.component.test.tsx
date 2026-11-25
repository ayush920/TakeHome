import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WizardStep2 } from '@/src/features/claims/components/wizard-step-2';
import { WizardStep3 } from '@/src/features/claims/components/wizard-step-3';
import { useClaimWizardStore } from '@/src/features/claims/stores/use-claim-wizard-store';
import toast from 'react-hot-toast';
import { itKnownDefect } from './support/known-defect';
import { jsonResponse, networkFailure, stubBff } from './support/network';
import { CLAIM_ID, VALID_CLAIM_FORM, validationProblem } from './support/claim-fixtures';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const SUBMIT_CLAIM = 'POST /api/claims';
const GENERIC_SUBMIT_ERROR = 'Failed to submit claim. Please try again.';
const createdClaim = { ...VALID_CLAIM_FORM, claimId: CLAIM_ID.first, userId: 'u-1', status: 'SUBMITTED',
  incidentDate: '2026-02-10', createdAt: '2026-02-11T09:00:00Z', updatedAt: '2026-02-11T09:00:00Z' };

const submitButton = () => screen.getByRole('button', { name: /submit claim/i });

describe('claim description step', () => {
  const MIN_LENGTH_DESCRIPTION = 'Rear-ended at the lights';
  const TOO_SHORT_DESCRIPTION = 'too short';
  const WHITESPACE_ONLY_DESCRIPTION = ' '.repeat(12);

  beforeEach(() => useClaimWizardStore.getState().resetWizard());

  it('lets the user continue once the description is long enough', async () => {
    const user = userEvent.setup();
    render(<WizardStep2 />);

    await user.type(screen.getByLabelText(/describe what happened/i), MIN_LENGTH_DESCRIPTION);

    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });

  it('keeps Next disabled and explains why when the description is too short', async () => {
    const user = userEvent.setup();
    render(<WizardStep2 />);

    await user.type(screen.getByLabelText(/describe what happened/i), TOO_SHORT_DESCRIPTION);

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 10 characters/i);
  });

  // F-05: the server trims the description and rejects it, answering 500 with no explanation.
  // The form should stop the user before they reach that dead end.
  itKnownDefect('F-05', 'does not accept a description made only of spaces', async () => {
    const user = userEvent.setup();
    render(<WizardStep2 />);

    await user.type(screen.getByLabelText(/describe what happened/i), WHITESPACE_ONLY_DESCRIPTION);

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});

describe('submitting a claim from the review step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClaimWizardStore.getState().resetWizard();
    useClaimWizardStore.setState({ formData: { ...VALID_CLAIM_FORM }, step: 3 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends exactly what the user reviewed', async () => {
    const bff = stubBff({ [SUBMIT_CLAIM]: () => jsonResponse(201, createdClaim) });
    render(<WizardStep3 />);

    await userEvent.setup().click(submitButton());

    await waitFor(() => expect(bff.callsTo(SUBMIT_CLAIM)).toHaveLength(1));
    expect(JSON.parse(bff.callsTo(SUBMIT_CLAIM)[0].init.body as string)).toMatchObject({
      incidentDate: '2026-02-10',
      incidentLocation: VALID_CLAIM_FORM.incidentLocation,
      claimAmount: VALID_CLAIM_FORM.claimAmount,
      description: VALID_CLAIM_FORM.description,
    });
  });

  it('confirms the claim, clears the wizard and returns to the claims list on success', async () => {
    stubBff({ [SUBMIT_CLAIM]: () => jsonResponse(201, createdClaim) });
    render(<WizardStep3 />);

    await userEvent.setup().click(submitButton());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/claims'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining(CLAIM_ID.first));
    expect(useClaimWizardStore.getState().formData).toEqual({});
  });

  it('shows the server explanation and keeps the user data when the server rejects the claim (400)', async () => {
    const reason = 'claimAmount: must be at most 1000000';
    stubBff({ [SUBMIT_CLAIM]: () => jsonResponse(400, validationProblem(reason)) });
    render(<WizardStep3 />);

    await userEvent.setup().click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(reason);
    expect(router.push).not.toHaveBeenCalled();
    expect(useClaimWizardStore.getState().formData.description).toBe(VALID_CLAIM_FORM.description);
  });

  it.each([
    ['the server fails (500)', () => jsonResponse(500, { status: 500, error: 'Internal Server Error' })],
    ['the network is down', networkFailure()],
  ])('tells the user to try again and does not lose their claim when %s', async (_name, handler) => {
    stubBff({ [SUBMIT_CLAIM]: handler });
    render(<WizardStep3 />);

    await userEvent.setup().click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_SUBMIT_ERROR);
    expect(submitButton()).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
    expect(useClaimWizardStore.getState().formData.description).toBe(VALID_CLAIM_FORM.description);
  });

  it('succeeds on retry after a transient server failure', async () => {
    const bff = stubBff({ [SUBMIT_CLAIM]: () => jsonResponse(500) });
    const user = userEvent.setup();
    render(<WizardStep3 />);
    await user.click(submitButton());
    await screen.findByRole('alert');
    bff.respondWith(SUBMIT_CLAIM, () => jsonResponse(201, createdClaim));

    await user.click(submitButton());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/claims'));
    expect(bff.callsTo(SUBMIT_CLAIM)).toHaveLength(2);
  });

  it('sends only one request when the user double-clicks while the first is in flight', async () => {
    let finishRequest: () => void = () => {};
    const bff = stubBff({
      [SUBMIT_CLAIM]: () => new Promise<Response>((resolve) => {
        finishRequest = () => resolve(jsonResponse(201, createdClaim));
      }),
    });
    const user = userEvent.setup();
    render(<WizardStep3 />);

    await user.dblClick(submitButton());

    expect(await screen.findByRole('button', { name: /submitting/i })).toBeDisabled();
    expect(bff.callsTo(SUBMIT_CLAIM)).toHaveLength(1);
    finishRequest();
    await waitFor(() => expect(router.push).toHaveBeenCalled());
  });
});
