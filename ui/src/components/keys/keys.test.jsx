import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Keys from './keys';
import { MemoryRouter } from 'react-router-dom';

const { getPage, putKey } = vi.hoisted(() => ({ getPage: vi.fn(), putKey: vi.fn() }));
vi.mock('../../data/service', () => ({
  default: class {
    GetKeyPage = getPage;
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

it('uses bounded server pages and explicit prefix queries instead of whole-tree reads', async () => {
  const user = userEvent.setup();
  getPage.mockResolvedValue({
    items: [{ key: '/one', keyEncoding: 'utf8' }],
    revision: '7',
    hasMore: true,
    nextCursor: 'signed-next',
  });
  render(
    <MemoryRouter>
      <Keys />
    </MemoryRouter>,
  );
  await screen.findByText('one');
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() =>
    expect(getPage).toHaveBeenCalledWith(
      { prefix: '', cursor: 'signed-next', limit: 100 },
      expect.any(AbortSignal),
    ),
  );
  await user.type(screen.getByRole('textbox', { name: 'Key prefix' }), '/app/');
  await user.click(screen.getByRole('button', { name: 'Apply prefix' }));
  await waitFor(() =>
    expect(getPage).toHaveBeenCalledWith(
      { prefix: '/app/', cursor: null, limit: 100 },
      expect.any(AbortSignal),
    ),
  );
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
  await screen.findByText('existing');
  await user.click(screen.getByRole('tab', { name: 'List', exact: true }));
  await user.click(screen.getByRole('button', { name: '/existing', exact: true }));
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
  await screen.findByText('one');
  await user.click(screen.getByRole('tab', { name: 'List' }));
  await user.click(screen.getByRole('button', { name: '/one', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Make dirty' }));
  await user.click(screen.getByRole('button', { name: '/two', exact: true }));
  expect(screen.getByText('Editing: /one')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(screen.getByText('Editing: /one')).toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: '/two', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Discard and continue' }));
  expect(screen.getByText('Editing: /two')).toBeInTheDocument();
});
