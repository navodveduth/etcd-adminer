import { expect, it, vi } from 'vitest';
import { FOLDER_PAGE_SIZE, loadFolderKeys } from './folderKeys';

const item = (key) => ({ key, keyEncoding: 'utf8', modRevision: '9' });
const page = (items, nextCursor = null) => ({
  items,
  revision: '9007199254740993',
  hasMore: Boolean(nextCursor),
  nextCursor,
});

it('collects every page with the same query and signed snapshot cursor, without fetching values', async () => {
  const service = {
    GetKeyPage: vi
      .fn()
      .mockResolvedValueOnce(page([item('/system/common/config')], 'signed-1'))
      .mockResolvedValueOnce(page([item('/system/drivers/config')], 'signed-2'))
      .mockResolvedValueOnce(page([item('/system/riders/config')])),
  };
  const signal = new AbortController().signal;
  const progress = vi.fn();
  const result = await loadFolderKeys(service, '/system/', null, signal, progress);
  expect(result.items.map(({ key }) => key)).toEqual([
    '/system/common/config',
    '/system/drivers/config',
    '/system/riders/config',
  ]);
  expect(result.hasMore).toBe(false);
  expect(service.GetKeyPage.mock.calls.map(([query]) => query)).toEqual(
    [null, 'signed-1', 'signed-2'].map((cursor) => ({
      prefix: '/system/',
      cursor,
      limit: FOLDER_PAGE_SIZE,
    })),
  );
  expect(progress).toHaveBeenCalledTimes(3);
});

it('stops after ten requests, exposes incompleteness, and appends on explicit continuation', async () => {
  let index = 0;
  const service = {
    GetKeyPage: vi.fn(async () => page([item(`/project-${++index}/config`)], `cursor-${index}`)),
  };
  const signal = new AbortController().signal;
  const first = await loadFolderKeys(service, '', null, signal, () => {});
  expect(service.GetKeyPage).toHaveBeenCalledTimes(10);
  expect(first.items).toHaveLength(10);
  expect(first.hasMore).toBe(true);
  service.GetKeyPage.mockResolvedValueOnce(page([item('/last-project/config')]));
  const complete = await loadFolderKeys(service, '', first, signal, () => {});
  expect(service.GetKeyPage).toHaveBeenLastCalledWith(
    { prefix: '', cursor: 'cursor-10', limit: 1000 },
    signal,
  );
  expect(complete.items).toHaveLength(11);
  expect(complete.hasMore).toBe(false);
});

it('cancels pending pagination and ignores a late response', async () => {
  const controller = new AbortController();
  const progress = vi.fn();
  let finish;
  const service = {
    GetKeyPage: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  };
  const result = loadFolderKeys(service, '', null, controller.signal, progress);
  controller.abort();
  finish(page([item('/late/config')]));
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(progress).not.toHaveBeenCalled();
  expect(service.GetKeyPage).toHaveBeenCalledTimes(1);
});

it('keeps confirmed partial progress but surfaces a later authorization or transport failure', async () => {
  const failure = { response: { status: 403, data: { message: 'permission denied' } } };
  const service = {
    GetKeyPage: vi
      .fn()
      .mockResolvedValueOnce(page([item('/first/config')], 'signed-1'))
      .mockRejectedValueOnce(failure),
  };
  const progress = vi.fn();
  await expect(
    loadFolderKeys(service, '', null, new AbortController().signal, progress),
  ).rejects.toBe(failure);
  expect(progress).toHaveBeenCalledTimes(1);
  expect(progress.mock.calls[0][0].hasMore).toBe(true);
});

it('does not combine different snapshot revisions', async () => {
  const service = {
    GetKeyPage: vi
      .fn()
      .mockResolvedValueOnce(page([item('/first')], 'signed-1'))
      .mockResolvedValueOnce({ ...page([item('/second')]), revision: '9007199254740994' }),
  };
  const progress = vi.fn();
  await expect(
    loadFolderKeys(service, '', null, new AbortController().signal, progress),
  ).rejects.toThrow('snapshot changed');
  expect(progress).toHaveBeenCalledTimes(1);
});

it.each([null, 'signed-1'])(
  'rejects missing or repeated continuation cursors (%s)',
  async (cursor) => {
    const service = {
      GetKeyPage: vi
        .fn()
        .mockResolvedValueOnce(page([item('/first')], 'signed-1'))
        .mockResolvedValueOnce({ ...page([item('/second')]), hasMore: true, nextCursor: cursor }),
    };
    await expect(
      loadFolderKeys(service, '', null, new AbortController().signal, () => {}),
    ).rejects.toThrow('did not advance');
    expect(service.GetKeyPage).toHaveBeenCalledTimes(2);
  },
);

it('rejects an oversized server response', async () => {
  const service = {
    GetKeyPage: vi
      .fn()
      .mockResolvedValue(page(Array.from({ length: 1001 }, (_, i) => item(`/key-${i}`)))),
  };
  await expect(
    loadFolderKeys(service, '', null, new AbortController().signal, () => {}),
  ).rejects.toThrow('safety limit');
});
