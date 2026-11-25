import { execFileSync } from 'node:child_process';
import { TEST_DATA_PREFIX } from '../tests/support/config';

const POSTGRES_CONTAINER = process.env.QA_POSTGRES_CONTAINER ?? 'demo-postgres';
const DATABASE = process.env.QA_DB_NAME ?? 'demo_app';
const DB_USER = process.env.QA_DB_USER ?? 'postgres';

/** Removes only rows the suite created: claims by description prefix, users by email prefix. */
const CLEANUP_SQL = `
  DELETE FROM claims WHERE description LIKE '${TEST_DATA_PREFIX}%';
  DELETE FROM users WHERE email LIKE '${TEST_DATA_PREFIX.toLowerCase()}-%';
`;

export function cleanupTestData(): void {
  try {
    execFileSync(
      'docker',
      ['exec', POSTGRES_CONTAINER, 'psql', '-U', DB_USER, '-d', DATABASE, '-c', CLEANUP_SQL],
      { stdio: 'pipe' },
    );
  } catch (error) {
    // Cleanup is a courtesy: never fail a test run because the database container is not reachable.
    console.warn(`[qa] test-data cleanup skipped: ${(error as Error).message.split('\n')[0]}`);
  }
}

if (process.argv[1]?.endsWith('cleanup-test-data.ts')) cleanupTestData();
