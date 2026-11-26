import { expect, it } from 'vitest';
import { connectionErrorMessage } from './errorMessage';

it('explains backend timeouts without blaming the supplied password', () => {
  const message = connectionErrorMessage({ response: { status: 504, data: { code: 'timeout' } } });
  expect(message).toContain('VPN');
  expect(message).toContain('Adminer server');
  expect(message).toContain('not an invalid-password response');
});

it('preserves API error messages and fallback errors', () => {
  expect(connectionErrorMessage({ response: { data: { message: 'Access denied' } } })).toBe(
    'Access denied',
  );
  expect(connectionErrorMessage({}, 'Unavailable')).toBe('Unavailable');
});
