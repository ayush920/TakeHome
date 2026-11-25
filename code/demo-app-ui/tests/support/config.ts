/**
 * Single source of truth for everything the black-box tests need to know about the running stack.
 * Every value can be overridden from the environment so the suite can point at another deployment.
 */

const fromEnv = (name: string, fallback: string): string => process.env[name] ?? fallback;

export const STACK = {
  uiUrl: fromEnv('QA_UI_URL', 'http://localhost:3001'),
  bffUrl: fromEnv('QA_BFF_URL', 'http://localhost:8090'),
  claimsServiceUrl: fromEnv('QA_CLAIMS_URL', 'http://localhost:8080'),
  keycloakTokenUrl: fromEnv(
    'QA_KEYCLOAK_TOKEN_URL',
    'http://localhost:8180/realms/demo-app/protocol/openid-connect/token',
  ),
  keycloakClientId: fromEnv('QA_KEYCLOAK_CLIENT_ID', 'demo-app-ui'),
} as const;

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** Seeded demo accounts (see docker/keycloak realm import). */
export const ACCOUNTS: Record<'claimant' | 'admin', Credentials> = {
  claimant: {
    email: fromEnv('QA_CLAIMANT_EMAIL', 'claimant@demo.com'),
    password: fromEnv('QA_CLAIMANT_PASSWORD', 'Claimant123!'),
  },
  admin: {
    email: fromEnv('QA_ADMIN_EMAIL', 'admin@demo.com'),
    password: fromEnv('QA_ADMIN_PASSWORD', 'Admin123!'),
  },
};

export const ENDPOINTS = {
  login: '/api/auth/login',
  csrf: '/api/auth/csrf',
  claims: '/api/claims',
  claim: (claimId: string) => `/api/claims/${claimId}`,
  adminClaims: '/api/admin/claims',
  adminClaimStatus: (claimId: string) => `/api/admin/claims/${claimId}/status`,
  adminDashboardStats: '/api/admin/dashboard/stats',
  users: '/api/users',
  user: (userId: string) => `/api/users/${userId}`,
} as const;

export const CSRF = {
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
} as const;

export const HTTP = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;

/** Any 4xx: "the client did something wrong", as opposed to the server failing. */
export const isClientError = (status: number): boolean => status >= 400 && status < 500;

export const ClaimStatus = {
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED',
} as const;
export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus];

export const UserRole = { ADMIN: 'ADMIN', CLAIMANT: 'CLAIMANT' } as const;

/** Prefix on all data the suite creates, so it can be found and removed (see `npm run test:cleanup`). */
export const TEST_DATA_PREFIX = 'QA-AUTO';

/** Domain limits taken from the API contract, named so tests do not carry magic numbers. */
export const CLAIM_LIMITS = {
  maxAmount: 1_000_000,
  aboveMaxAmount: 1_000_000.01,
  minDescriptionLength: 10,
} as const;
