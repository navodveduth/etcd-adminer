import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import Keys from './keys';
import { MemoryRouter } from 'react-router-dom';

const { getPage, getFolder, putKey } = vi.hoisted(() => ({
  getPage: vi.fn(),
  getFolder: vi.fn(),
  putKey: vi.fn(),
}));
beforeEach(() => {
  getFolder.mockReset().mockResolvedValue({ items: [], revision: '7', hasMore: false });
});
vi.mock('../../data/service', () => ({
  default: class {
    GetKeyPage = getPage;
    GetFolderPage = getFolder;
    PutKey = putKey;
  },
}));
vi.mock('./editor', () => ({
  default: ({ etcdKey, onDirtyChange }) => (
    <div>
      <span>Editing: {etcdKey ?? 'none'}</span>
      <button onClick={() => onDirtyChange(true)}>Make dirty</button>
    </div>
  ),
}));

it('automatically applies prefix queries and resets pagination without an Apply button', async () => {
  const user = userEvent.setup();
  getPage.mockReset().mockImplementation(async ({ cursor }) => ({
    items: [{ key: cursor ? '/two' : '/one', keyEncoding: 'utf8' }],
    revision: '7',
    hasMore: !cursor,
    nextCursor: cursor ? null : 'signed-next',
  }));
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('tab', { name: 'List', exact: true }));
  await screen.findByRole('button', { name: '/one', exact: true });
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() =>
    expect(getPage).toHaveBeenCalledWith(
      { prefix: '', cursor: 'signed-next', limit: 100 },
      expect.any(AbortSignal),
    ),
  );
  await user.type(screen.getByRole('textbox', { name: 'Key prefix' }), '/app/');
  expect(screen.queryByRole('button', { name: 'Apply prefix' })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(getPage).toHaveBeenCalledWith(
      { prefix: '/app/', cursor: null, limit: 100 },
      expect.any(AbortSignal),
    ),
  );
  await user.clear(screen.getByRole('textbox', { name: 'Key prefix' }));
  await waitFor(() =>
    expect(getPage).toHaveBeenLastCalledWith(
      { prefix: '', cursor: null, limit: 100 },
      expect.any(AbortSignal),
    ),
  );
});

it('requests only immediate children when each folder is expanded', async () => {
  getPage.mockReset();
  getFolder.mockImplementation(async ({ prefix }) => ({
    items: (prefix === ''
      ? ['/system']
      : prefix === '/system/'
        ? ['/system/driver-services', '/system/rider-services']
        : [
            '/system/driver-services/backend-meter',
            '/system/driver-services/driver-payment',
            '/system/driver-services/waiting-fee-service',
          ]
    ).map((key) => ({ key, keyEncoding: 'utf8', isDirectory: true })),
    revision: '169592',
    hasMore: false,
  }));
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  await screen.findByText('system');
  expect(getFolder).toHaveBeenCalledTimes(1);
  expect(getPage).not.toHaveBeenCalled();
  await user.click(screen.getByText('system'));
  await user.click(await screen.findByText('driver-services'));
  expect(await screen.findByText('backend-meter')).toBeVisible();
  expect(screen.getByText('driver-payment')).toBeVisible();
  expect(screen.getByText('waiting-fee-service')).toBeVisible();
  expect(screen.getByText('rider-services')).toBeVisible();
  expect(getFolder).toHaveBeenLastCalledWith(
    { prefix: '/system/driver-services/', cursor: null, limit: 100 },
    expect.any(AbortSignal),
  );
});

it('does not report a failed folder listing as complete and allows a fresh retry', async () => {
  getFolder
    .mockReset()
    .mockRejectedValueOnce(new Error('Snapshot compacted'))
    .mockResolvedValue({
      items: [{ key: '/retried', keyEncoding: 'utf8' }],
      revision: '9',
      hasMore: false,
    });
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  await screen.findByText('Snapshot compacted');
  expect(screen.getByRole('status')).toHaveTextContent('Folder listing incomplete');
  expect(screen.queryByText(/All matching keys loaded/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Refresh keys' }));
  await screen.findByText('retried');
  expect(screen.getByRole('status')).toHaveTextContent('Subfolders load on expansion');
});

it('aborts later folder pages when the prefix changes without mixing trees', async () => {
  let finish;
  getFolder
    .mockReset()
    .mockResolvedValueOnce({
      items: [{ key: '/old-project', keyEncoding: 'utf8', isDirectory: true }],
      revision: '7',
      hasMore: false,
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({
      items: [{ key: '/new-project/config', keyEncoding: 'utf8' }],
      revision: '8',
      hasMore: false,
    });
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByText('old-project'));
  await waitFor(() => expect(getFolder).toHaveBeenCalledTimes(2));
  const signal = getFolder.mock.calls[1][1];
  fireEvent.change(screen.getByRole('textbox', { name: 'Key prefix' }), {
    target: { value: '/new-project/' },
  });
  expect(signal.aborted).toBe(true);
  await screen.findByText('new-project');
  await act(async () =>
    finish({
      items: [{ key: '/late-project/config', keyEncoding: 'utf8' }],
      revision: '7',
      hasMore: false,
    }),
  );
  expect(screen.queryByText('old-project')).not.toBeInTheDocument();
  expect(screen.queryByText('late-project')).not.toBeInTheDocument();
});

it('debounces rapid prefix edits and waits for IME composition to finish', async () => {
  getFolder.mockReset().mockResolvedValue({
    items: [{ key: '/one', keyEncoding: 'utf8' }],
    revision: '7',
    hasMore: false,
  });
  const view = render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  await screen.findByText('one');
  const input = screen.getByRole('textbox', { name: 'Key prefix' });
  vi.useFakeTimers();
  try {
    fireEvent.change(input, { target: { value: '/a' } });
    fireEvent.change(input, { target: { value: '/app/' } });
    expect(getFolder).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(349);
    });
    expect(getFolder).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getFolder).toHaveBeenCalledTimes(2);
    expect(getFolder).toHaveBeenLastCalledWith(
      { prefix: '/app/', cursor: null, limit: 100 },
      expect.any(AbortSignal),
    );
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '/日本語/' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(getFolder).toHaveBeenCalledTimes(2);
    fireEvent.compositionEnd(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(getFolder).toHaveBeenLastCalledWith(
      { prefix: '/日本語/', cursor: null, limit: 100 },
      expect.any(AbortSignal),
    );
    fireEvent.change(input, { target: { value: '/fast/' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(getFolder).toHaveBeenLastCalledWith(
      { prefix: '/fast/', cursor: null, limit: 100 },
      expect.any(AbortSignal),
    );
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it('aborts stale reads immediately and ignores their late results when the prefix changes', async () => {
  let finish;
  getFolder
    .mockReset()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({
      items: [{ key: '/new/result', keyEncoding: 'utf8' }],
      revision: '8',
      hasMore: false,
    });
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  const signal = getFolder.mock.calls[0][1];
  fireEvent.change(screen.getByRole('textbox', { name: 'Key prefix' }), {
    target: { value: '/new/' },
  });
  expect(signal.aborted).toBe(true);
  await screen.findByText('new');
  await act(async () =>
    finish({ items: [{ key: '/stale', keyEncoding: 'utf8' }], revision: '7', hasMore: false }),
  );
  expect(screen.queryByText('stale')).not.toBeInTheDocument();
  expect(screen.getByText('new')).toBeInTheDocument();
});

it('creates a full-path key from List view without replacing the current editor draft', async () => {
  const user = userEvent.setup();
  getPage.mockResolvedValue({
    items: [{ key: '/existing', keyEncoding: 'utf8' }],
    revision: '7',
    hasMore: false,
  });
  putKey.mockResolvedValue(true);
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('tab', { name: 'List', exact: true }));
  await user.click(await screen.findByRole('button', { name: '/existing', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Make dirty' }));
  await user.click(screen.getByRole('button', { name: 'New key', exact: true }));
  await user.type(screen.getByLabelText('Full key path'), '/outside/new');
  await user.type(screen.getByLabelText('Value'), 'new value');
  await user.click(screen.getByRole('button', { name: 'Create key', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Editing: /existing')).toBeInTheDocument();
  expect(screen.getByText('Unsaved draft')).toBeInTheDocument();
  expect(screen.getByText('/outside/new', { selector: 'code' })).toBeInTheDocument();
});

it('retains the selected draft until discard is explicitly confirmed', async () => {
  const user = userEvent.setup();
  getPage.mockResolvedValue({
    items: [
      { key: '/one', keyEncoding: 'utf8' },
      { key: '/two', keyEncoding: 'utf8' },
    ],
    revision: '7',
    hasMore: false,
  });
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('tab', { name: 'List' }));
  await user.click(await screen.findByRole('button', { name: '/one', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Make dirty' }));
  await user.click(screen.getByRole('button', { name: '/two', exact: true }));
  expect(screen.getByText('Editing: /one')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(screen.getByText('Editing: /one')).toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: '/two', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Discard and continue' }));
  expect(screen.getByText('Editing: /two')).toBeInTheDocument();
});

it('cancels a folder load when switching to List and ignores its late results', async () => {
  let finishFolder;
  getFolder.mockReset().mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishFolder = resolve;
      }),
  );
  getPage.mockReset().mockResolvedValue({
    items: [{ key: '/list-only', keyEncoding: 'utf8' }],
    revision: '9',
    hasMore: false,
  });
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  const folderSignal = getFolder.mock.calls[0][1];
  await user.click(screen.getByRole('tab', { name: 'List', exact: true }));
  expect(folderSignal.aborted).toBe(true);
  await screen.findByRole('button', { name: '/list-only', exact: true });
  await act(async () =>
    finishFolder({
      items: [{ key: '/late-folder', keyEncoding: 'utf8' }],
      revision: '8',
      hasMore: false,
    }),
  );
  expect(
    screen.queryByRole('button', { name: '/late-folder', exact: true }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 keys on this page');
  expect(getPage).toHaveBeenLastCalledWith(
    { prefix: '', cursor: null, limit: 100 },
    expect.any(AbortSignal),
  );
});
