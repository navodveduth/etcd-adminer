import { expect, it, vi } from 'vitest';
import {
  applyFolderCopy,
  copyDestinationError,
  previewFolderCopy,
  remapFolderRecords,
} from './duplicateFolder';
import { encodeKey } from './transfer';

const record = (key, value = 'secret') => ({
  keyBase64: encodeKey(key),
  valueBase64: encodeKey(value),
});
const serviceFixture = () => ({
  ExportPage: vi
    .fn()
    .mockResolvedValue({ revision: '40', hasMore: false, records: [record('/t0002/util/key')] }),
  TransferBatch: vi.fn().mockImplementation(async (batch) => ({
    applied: !batch.dryRun,
    existing: 0,
    records: batch.records.map((item) => ({ ...item, expectedRevision: '0' })),
  })),
});

it('rejects identical, ancestor and descendant destinations but allows sibling prefixes', () => {
  expect(copyDestinationError('/t0002', '/t0002/')).toMatch(/non-overlapping/);
  expect(copyDestinationError('/t0002', '/t0002/copy')).toMatch(/non-overlapping/);
  expect(copyDestinationError('/app/t0002', '/app')).toMatch(/non-overlapping/);
  expect(copyDestinationError('/t0002', '/t0002-new')).toBe('');
  expect(copyDestinationError('', '/copy')).toMatch(/non-root/);
});

it('copies arbitrary binary suffixes and values losslessly without replacing value contents', () => {
  const input = {
    keyBase64: btoa(atob(encodeKey('/租户/t0002/')) + '\x00\xffsuffix'),
    valueBase64: btoa('\x00\xff/t0002/'),
  };
  const [output] = remapFolderRecords([input], '/租户/t0002', '/租户/t0003');
  expect(atob(output.keyBase64)).toBe(atob(encodeKey('/租户/t0003/')) + '\x00\xffsuffix');
  expect(output.valueBase64).toBe(input.valueBase64);
  expect(() => remapFolderRecords([record('/t00020/key')], '/t0002', '/copy')).toThrow(/outside/);
  expect(atob(remapFolderRecords([record('/app//key')], '/app//', '/app/copy')[0].keyBase64)).toBe(
    '/app/copy/key',
  );
  expect(() => remapFolderRecords([record('/app/sibling')], '/app//', '/app/copy')).toThrow(
    /outside/,
  );
});

it('reads all signed snapshot pages before previewing create-only batches and applies only after confirmation by the caller', async () => {
  const service = serviceFixture();
  service.ExportPage.mockResolvedValueOnce({
    revision: '40',
    hasMore: true,
    nextCursor: 'signed-page-2',
    records: [record('/t0002/one')],
  }).mockResolvedValueOnce({ revision: '40', hasMore: false, records: [record('/t0002/two')] });
  const signal = new AbortController().signal;
  const preview = await previewFolderCopy(service, {
    source: '/t0002',
    destination: '/t0003',
    signal,
  });
  expect(preview.count).toBe(2);
  expect(service.ExportPage.mock.calls[1][0]).toEqual({
    prefix: '/t0002/',
    cursor: 'signed-page-2',
  });
  expect(
    service.TransferBatch.mock.calls.every(([batch]) => batch.dryRun && batch.policy === 'create'),
  ).toBe(true);
  expect(preview.pages.flat().map((item) => atob(item.keyBase64))).toEqual([
    '/t0003/one',
    '/t0003/two',
  ]);
  const progress = vi.fn();
  expect(await applyFolderCopy(service, preview, { signal, onProgress: progress })).toBe(2);
  expect(service.TransferBatch.mock.calls[2][0]).toMatchObject({
    operation: 'import',
    policy: 'create',
    dryRun: false,
    confirmation: 'IMPORT 1',
    records: [{ expectedRevision: '0' }],
  });
  expect(progress).toHaveBeenLastCalledWith(2);
});

it('blocks collisions, empty folders, changed snapshots and oversized copies before any write', async () => {
  const signal = new AbortController().signal;
  const service = serviceFixture();
  service.TransferBatch.mockResolvedValueOnce({ existing: 1 });
  await expect(
    previewFolderCopy(service, { source: '/t0002', destination: '/copy', signal }),
  ).rejects.toThrow(/already exist/);
  service.ExportPage.mockResolvedValueOnce({ revision: '40', records: [], hasMore: false });
  await expect(
    previewFolderCopy(service, { source: '/t0002', destination: '/copy', signal }),
  ).rejects.toThrow(/No readable/);
  service.ExportPage.mockResolvedValueOnce({
    revision: '40',
    records: [record('/t0002/a')],
    hasMore: true,
    nextCursor: 'next',
  }).mockResolvedValueOnce({ revision: '41', records: [record('/t0002/b')], hasMore: false });
  await expect(
    previewFolderCopy(service, { source: '/t0002', destination: '/copy', signal }),
  ).rejects.toThrow(/snapshot changed/);
  service.ExportPage.mockResolvedValueOnce({
    revision: '40',
    records: Array.from({ length: 1001 }, (_, i) => record(`/t0002/${i}`)),
    hasMore: false,
  });
  await expect(
    previewFolderCopy(service, { source: '/t0002', destination: '/copy', signal }),
  ).rejects.toThrow(/1,000/);
  expect(service.TransferBatch.mock.calls.every(([batch]) => batch.dryRun)).toBe(true);
});

it('stops at the first failed batch and does not retry or roll back earlier copies', async () => {
  const service = serviceFixture();
  service.TransferBatch.mockResolvedValueOnce({ applied: true }).mockRejectedValueOnce(
    new Error('connection lost'),
  );
  const progress = vi.fn();
  const pages = [[record('/copy/a')], [record('/copy/b')], [record('/copy/c')]];
  await expect(
    applyFolderCopy(
      service,
      { pages },
      { signal: new AbortController().signal, onProgress: progress },
    ),
  ).rejects.toThrow('connection lost');
  expect(service.TransferBatch).toHaveBeenCalledTimes(2);
  expect(progress).toHaveBeenCalledOnce();
  expect(progress).toHaveBeenCalledWith(1);
});

it('does not issue requests after cancellation', async () => {
  const service = serviceFixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    previewFolderCopy(service, {
      source: '/t0002',
      destination: '/copy',
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await expect(
    applyFolderCopy(service, { pages: [[record('/copy/a')]] }, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(service.ExportPage).not.toHaveBeenCalled();
  expect(service.TransferBatch).not.toHaveBeenCalled();
});
