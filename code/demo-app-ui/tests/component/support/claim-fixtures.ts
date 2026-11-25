import type { ClaimSummaryResponse } from '@/src/lib/api/bff-client';

export const CLAIM_ID = {
  first: '11111111-aaaa-4aaa-8aaa-111111111111',
  second: '22222222-bbbb-4bbb-8bbb-222222222222',
} as const;

/** Wire format (dates as ISO strings), exactly what the BFF sends. */
export const claimSummaryJson = (overrides: Partial<Record<keyof ClaimSummaryResponse, unknown>> = {}) => ({
  claimId: CLAIM_ID.first,
  incidentDate: '2026-02-10',
  description: 'Rear-ended at traffic lights',
  claimAmount: 1250,
  status: 'SUBMITTED',
  createdAt: '2026-02-11T09:00:00Z',
  ...overrides,
});

export const VALID_CLAIM_FORM = {
  incidentDate: new Date('2026-02-10'),
  incidentLocation: '12 Orchard Road, Singapore',
  claimAmount: 1250,
  description: 'Rear-ended at the traffic lights on Orchard Road',
} as const;

/** The BFF's RFC 7807 body for a validation failure. */
export const validationProblem = (detail: string) => ({
  type: 'https://api.demo-app.com/errors/validation-error',
  title: 'Validation Error',
  status: 400,
  detail,
});
