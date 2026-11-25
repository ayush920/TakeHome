import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { ClaimStatus, ENDPOINTS, HTTP, TEST_DATA_PREFIX } from './config';
import type { HttpClient } from './clients/http-client';

export interface ClaimRequest {
  incidentDate: string;
  incidentLocation: string;
  description: string;
  claimAmount: number;
}

export interface Claim extends ClaimRequest {
  claimId: string;
  userId: string;
  status: ClaimStatus;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * MS_PER_DAY).toISOString().slice(0, 10);

export const yesterday = (): string => isoDate(-1);
export const farFuture = (): string => isoDate(365 * 50);

/** A valid claim. Every description is unique and carries the prefix used by the cleanup script. */
export function buildClaimRequest(overrides: Partial<ClaimRequest> = {}): ClaimRequest {
  return {
    incidentDate: yesterday(),
    incidentLocation: '1 Test Street, Singapore',
    description: `${TEST_DATA_PREFIX} ${randomUUID()}`,
    claimAmount: 250,
    ...overrides,
  };
}

/** Submits a claim through the given client and returns what the service stored. */
export async function submitClaim(
  client: HttpClient,
  overrides: Partial<ClaimRequest> = {},
): Promise<Claim> {
  const response = await client.post(ENDPOINTS.claims, buildClaimRequest(overrides));
  expect(response.status(), 'precondition: claim submission should succeed').toBe(HTTP.CREATED);
  return (await response.json()) as Claim;
}

/** Moves a claim through a sequence of statuses as the admin, failing loudly if any step is refused. */
export async function advanceClaim(
  adminClient: HttpClient,
  claimId: string,
  path: readonly ClaimStatus[],
): Promise<void> {
  for (const status of path) {
    const response = await adminClient.patch(ENDPOINTS.adminClaimStatus(claimId), { newStatus: status });
    expect(response.status(), `precondition: move claim to ${status}`).toBe(HTTP.OK);
  }
}
