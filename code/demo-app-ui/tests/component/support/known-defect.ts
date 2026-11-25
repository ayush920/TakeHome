import { it } from 'vitest';

/**
 * Registers a test that asserts the CORRECT behaviour of something that is currently broken.
 *
 * Vitest's `it.fails` passes while the assertion fails and fails once the defect is fixed, which
 * tells the author to remove the marker. Set QA_KNOWN_DEFECTS=fail to run it as a normal test and see
 * the raw failure. Same convention as the Playwright suite (tests/support/known-defect.ts).
 *
 * @param findingId reference into evidence/01-Application-Risk-Assessment.docx (for example "F-10")
 */
export function itKnownDefect(findingId: string, name: string, body: () => void | Promise<void>): void {
  const run = process.env.QA_KNOWN_DEFECTS === 'fail' ? it : it.fails;
  run(`[known defect ${findingId}] ${name}`, body);
}
