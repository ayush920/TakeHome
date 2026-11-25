import { test } from '@playwright/test';

/**
 * Marks the running test as exposing a real, documented application defect.
 *
 * The test body asserts the CORRECT behaviour. While the defect exists the assertion fails, and
 * Playwright reports that as an expected failure (suite stays green, defect stays visible). When the
 * defect is fixed the test starts passing, which Playwright reports as an unexpected pass, so the
 * marker gets removed deliberately instead of the defect being forgotten.
 *
 * Set QA_KNOWN_DEFECTS=fail to run these tests as ordinary tests and see the raw failures.
 *
 * @param findingId reference into evidence/01-Application-Risk-Assessment.docx (for example "F-01")
 * @param summary   what is wrong, in one sentence
 */
export function knownDefect(findingId: string, summary: string): void {
  const description = `${findingId}: ${summary}`;
  test.info().annotations.push({ type: 'known-defect', description });
  const reportAsFailure = process.env.QA_KNOWN_DEFECTS === 'fail';
  test.fail(!reportAsFailure, description);
}
