import { cleanupTestData } from '../../scripts/cleanup-test-data';

/** Removes the claims and users created by the run. Disable with QA_KEEP_DATA=1 to inspect them. */
export default async function globalTeardown(): Promise<void> {
  if (process.env.QA_KEEP_DATA !== '1') cleanupTestData();
}
