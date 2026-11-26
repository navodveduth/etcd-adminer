import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import FolderBrowser from './folderBrowser';

const { getFolder, getKeys } = vi.hoisted(() => ({ getFolder: vi.fn(), getKeys: vi.fn() }));
vi.mock('../../data/service', () => ({
  default: class {
    GetFolderPage = getFolder;
    GetKeyPage = getKeys;
  },
}));
beforeEach(() => {
  getFolder.mockReset();
  getKeys.mockReset();
});
const entry = (key, isDirectory = false) => ({ key, isDirectory, keyEncoding: 'utf8' });
const page = (items, nextCursor = null) => ({
  items,
  revision: '9007199254740993',
  hasMore: Boolean(nextCursor),
  nextCursor,
});
const show = (props = {}) => render(<FolderBrowser prefix="" drafts={[]} {...props} />);

it('fetches only expanded branches, reuses their cache and selects exact keys', async () => {
  const user = userEvent.setup();
  getFolder.mockImplementation(async ({ prefix }) =>
    page(
      prefix === ''
        ? [entry('/system', true)]
        : prefix === '/system/'
          ? [entry('/system/apps', true)]
          : [entry('/system/apps/config')],
    ),
  );
  const select = vi.fn();
  show({ onKeyClick: select });
  await screen.findByText('system');
  expect(getFolder).toHaveBeenCalledTimes(1);
  expect(getKeys).not.toHaveBeenCalled();
  await user.click(screen.getByText('system'));
  await user.click(await screen.findByText('apps'));
  await user.click(await screen.findByText('config'));
  expect(select).toHaveBeenCalledWith('/system/apps/config');
  expect(getFolder.mock.calls.map(([query]) => query.prefix)).toEqual([
    '',
    '/system/',
    '/system/apps/',
  ]);
  await user.click(screen.getByText('apps'));
  expect(screen.queryByText('config')).not.toBeInTheDocument();
  await user.click(screen.getByText('apps'));
  expect(await screen.findByText('config')).toBeVisible();
  expect(getFolder).toHaveBeenCalledTimes(3);
});

it('continues just the requested folder with its signed cursor', async () => {
  const user = userEvent.setup();
  getFolder
    .mockResolvedValueOnce(page([entry('/first')], 'signed-next'))
    .mockResolvedValueOnce(page([entry('/second')]));
  show();
  await user.click(await screen.findByRole('button', { name: 'Load more in /', exact: true }));
  expect(await screen.findByText('second')).toBeVisible();
  expect(screen.getByText('first')).toBeVisible();
  expect(getFolder).toHaveBeenLastCalledWith(
    { prefix: '', cursor: 'signed-next', limit: 100 },
    expect.any(AbortSignal),
  );
  expect(
    screen.queryByRole('button', { name: 'Load more in /', exact: true }),
  ).not.toBeInTheDocument();
});

it('shows an authorization failure and retries without claiming a complete listing', async () => {
  const user = userEvent.setup();
  getFolder
    .mockRejectedValueOnce({ response: { status: 403, data: { message: 'permission denied' } } })
    .mockResolvedValueOnce(page([entry('/visible')]));
  show();
  await screen.findByText('permission denied');
  expect(screen.getByRole('status')).toHaveTextContent('incomplete');
  await user.click(screen.getByRole('button', { name: 'Retry folder' }));
  expect(await screen.findByText('visible')).toBeVisible();
});

it('aborts a collapsed branch and ignores late results before reopening it', async () => {
  let finish;
  getFolder
    .mockResolvedValueOnce(page([entry('/system', true)]))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(page([entry('/system/current')]));
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByText('system'));
  const signal = getFolder.mock.calls[1][1];
  await user.click(screen.getByText('system'));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(page([entry('/system/late')])));
  await user.click(screen.getByText('system'));
  expect(await screen.findByText('current')).toBeVisible();
  expect(screen.queryByText('late')).not.toBeInTheDocument();
});

it('does not widen a filtered prefix when expanding its display ancestors', async () => {
  getFolder.mockResolvedValue(page([entry('/app/nested/config')]));
  const user = userEvent.setup();
  show({ prefix: '/app/nested/' });
  await user.click(await screen.findByText('app'));
  await user.click(screen.getByText('nested'));
  expect(screen.getByText('config')).toBeVisible();
  expect(getFolder).toHaveBeenCalledTimes(1);
  expect(getFolder).toHaveBeenLastCalledWith(
    { prefix: '/app/nested/', cursor: null, limit: 100 },
    expect.any(AbortSignal),
  );
});

it.each(['snapshot', 'cursor'])(
  'rejects an inconsistent %s without appending its entries',
  async (failure) => {
    const next = {
      ...page([entry('/wrong')], failure === 'cursor' ? 'signed-next' : null),
      ...(failure === 'snapshot' ? { revision: '9007199254740994' } : {}),
    };
    getFolder
      .mockResolvedValueOnce(page([entry('/first')], 'signed-next'))
      .mockResolvedValueOnce(next);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Load more in /', exact: true }));
    await screen.findByRole('button', { name: 'Retry folder' });
    expect(screen.queryByText('wrong')).not.toBeInTheDocument();
    expect(screen.getByText('first')).toBeVisible();
  },
);

it('notices binary entries and emptiness without fetching key pages', async () => {
  getFolder.mockResolvedValueOnce(
    page([{ key: '/w==', keyEncoding: 'base64', isDirectory: false }]),
  );
  const view = show();
  expect(await screen.findByText(/1 binary folder entries/)).toBeVisible();
  expect(getKeys).not.toHaveBeenCalled();
  view.unmount();
  getFolder.mockResolvedValueOnce(page([]));
  show();
  expect(await screen.findByText('No readable entries at this prefix.')).toBeVisible();
});

it('refreshes the branch cache and resets expansion without prefetching descendants', async () => {
  getFolder
    .mockResolvedValueOnce(page([entry('/system', true)]))
    .mockResolvedValueOnce(page([entry('/system/old')]))
    .mockResolvedValueOnce(page([entry('/system', true)]))
    .mockResolvedValueOnce(page([entry('/system/current')]));
  const user = userEvent.setup();
  const view = show();
  await user.click(await screen.findByText('system'));
  await screen.findByText('old');
  view.rerender(<FolderBrowser prefix="" refresh={1} drafts={[]} />);
  await screen.findByText('system');
  expect(screen.queryByText('old')).not.toBeInTheDocument();
  expect(getFolder).toHaveBeenCalledTimes(3);
  await user.click(screen.getByText('system'));
  expect(await screen.findByText('current')).toBeVisible();
});
