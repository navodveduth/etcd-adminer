import { expect, it, vi } from 'vitest';
import { isProjectPrefix, loadProjectKeys } from './projectKeys';

const item = (key) => ({ key, keyEncoding: 'utf8' });
const page = (items, cursor = null) => ({
  items,
  revision: '9007199254740993',
  hasMore: Boolean(cursor),
  nextCursor: cursor,
});

it.each([
  ['', false],
  ['/', false],
  ['/system/', false],
  ['/system/driver-services/', false],
  ['/system/driver-services/backend-meter/', true],
  ['system/driver-services/backend-meter/', true],
  ['/system/driver-services/backend-meter/v1/', false],
  ['/system//backend-meter/', false],
  ['/system/driver-services/backend-meter', false],
])('scopes project prefetch correctly for %s', (prefix, expected) => {
  expect(isProjectPrefix(prefix)).toBe(expected);
});

it('collects the selected project across snapshot pages, never its parent namespace', async () => {
  const prefix = '/system/driver-services/backend-meter/';
  const service = {
    GetKeyPage: vi
      .fn()
      .mockResolvedValueOnce(page([item(`${prefix}v1/a`)], 'signed'))
      .mockResolvedValueOnce(page([item(`${prefix}v1/deeper/b`)])),
  };
  const signal = new AbortController().signal;
  const result = await loadProjectKeys(service, prefix, null, signal, () => {});
  expect(result.items).toHaveLength(2);
  expect(result.hasMore).toBe(false);
  expect(service.GetKeyPage.mock.calls.map(([query]) => query)).toEqual([
    { prefix, cursor: null, limit: 1000 },
    { prefix, cursor: 'signed', limit: 1000 },
  ]);
});

it('bounds automatic loads and resumes at the saved cursor without dropping prior keys', async () => {
  let count = 0;
  const service = {
    GetKeyPage: vi.fn(async () => page([item(`/project/key-${++count}`)], `cursor-${count}`)),
  };
  const signal = new AbortController().signal;
  const partial = await loadProjectKeys(service, '/project/', null, signal, () => {});
  expect(service.GetKeyPage).toHaveBeenCalledTimes(10);
  expect(partial.hasMore).toBe(true);
  service.GetKeyPage.mockResolvedValueOnce(page([item('/project/last')]));
  const result = await loadProjectKeys(service, '/project/', partial, signal, () => {});
  expect(result.items).toHaveLength(11);
  expect(result.hasMore).toBe(false);
  expect(service.GetKeyPage).toHaveBeenLastCalledWith(
    { prefix: '/project/', cursor: 'cursor-10', limit: 1000 },
    signal,
  );
});

it.each(['revision', 'cursor', 'oversized'])(
  'rejects an invalid %s without publishing that page',
  async (kind) => {
    const invalid =
      kind === 'revision'
        ? { ...page([item('/wrong')]), revision: '9007199254740994' }
        : kind === 'cursor'
          ? page([item('/wrong')], 'signed')
          : page(Array.from({ length: 1001 }, (_, i) => item(`/wrong-${i}`)));
    const service = {
      GetKeyPage: vi
        .fn()
        .mockResolvedValueOnce(page([item('/project/a')], 'signed'))
        .mockResolvedValueOnce(invalid),
    };
    const progress = vi.fn();
    await expect(
      loadProjectKeys(service, '/project/', null, new AbortController().signal, progress),
    ).rejects.toThrow(/snapshot|continuation/);
    expect(progress).toHaveBeenCalledTimes(1);
  },
);

it('cancels pending project reads and ignores a late response', async () => {
  let finish;
  const service = {
    GetKeyPage: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  };
  const controller = new AbortController();
  const progress = vi.fn();
  const result = loadProjectKeys(service, '/project/', null, controller.signal, progress);
  controller.abort();
  finish(page([item('/late')]));
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(progress).not.toHaveBeenCalled();
});
