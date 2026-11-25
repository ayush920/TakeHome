import { test, expect } from '../support/fixtures';
import { knownDefect } from '../support/known-defect';
import { AnonymousClient } from '../support/clients/anonymous-client';
import { STACK } from '../support/config';

/**
 * Finding F-07: Spring Boot Actuator is reachable without credentials. /env and /beans reveal
 * configuration and internals, and /loggers lets an anonymous caller change log levels.
 * These tests only READ; they never change a log level.
 */
const SENSITIVE_ACTUATOR_ENDPOINTS = ['env', 'beans', 'mappings', 'loggers/ROOT'] as const;
const SERVICES = [
  { name: 'claims-service', baseUrl: STACK.claimsServiceUrl },
  { name: 'bff-service', baseUrl: STACK.bffUrl },
] as const;
const DENIED_STATUSES = [401, 403, 404];

test.describe('actuator endpoints are not exposed to anonymous callers', () => {
  for (const { name, baseUrl } of SERVICES) {
    test(`${name} health endpoint is public (control)`, async ({ playwright }) => {
      const anonymous = await AnonymousClient.forService(playwright, baseUrl);

      const response = await anonymous.get('/actuator/health');

      expect(response.ok()).toBe(true);
      await anonymous.dispose();
    });

    for (const endpoint of SENSITIVE_ACTUATOR_ENDPOINTS) {
      test(`${name} /actuator/${endpoint} is denied`, async ({ playwright }) => {
        knownDefect('F-07', 'actuator exposure.include=* with permitAll leaves operational endpoints open');
        const anonymous = await AnonymousClient.forService(playwright, baseUrl);

        const response = await anonymous.get(`/actuator/${endpoint}`);

        expect(DENIED_STATUSES).toContain(response.status());
        await anonymous.dispose();
      });
    }
  }
});
