import { expect, it } from 'vitest';
import { formatBytes, workspaceLabel } from './presentation';

it('formats binary units without treating unavailable data as zero', () => {
  expect(formatBytes(null)).toBe('Unavailable');
  expect(formatBytes(-1)).toBe('Unavailable');
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1024)).toBe('1.0 KiB');
  expect(formatBytes(1048576)).toBe('1.00 MiB');
  expect(formatBytes(1073741824)).toBe('1.00 GiB');
});
it('deduplicates matching backend names without changing user-facing case', () => {
  expect(workspaceLabel({ Name: 'DEV', BackEnd: 'dev', UserName: 'Alice' })).toBe('DEV · Alice');
});
