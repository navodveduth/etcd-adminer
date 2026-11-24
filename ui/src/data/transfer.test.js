import { expect, it } from 'vitest';
import { displayKey, encodeKey, parseTransfer } from './transfer';
it('round trips UTF-8 and preserves binary records without trusting source revisions', () => {
  const key = encodeKey('/日本語');
  expect(displayKey(key)).toBe('/日本語');
  expect(
    parseTransfer(
      JSON.stringify({
        version: 1,
        records: [{ keyBase64: key, valueBase64: '/wA=', expectedRevision: '99' }],
      }),
    ),
  ).toEqual([{ keyBase64: key, valueBase64: '/wA=' }]);
});
it('rejects duplicate keys, unknown formats and oversized input', () => {
  const record = { keyBase64: 'YQ==', valueBase64: '' };
  expect(() => parseTransfer(JSON.stringify({ version: 1, records: [record, record] }))).toThrow(
    'unique',
  );
  expect(() => parseTransfer('{"version":2,"records":[]}')).toThrow('version 1');
  expect(() => parseTransfer('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('2 MiB');
});
