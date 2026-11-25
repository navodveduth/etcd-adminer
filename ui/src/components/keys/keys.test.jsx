import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Keys from './keys';
import { MemoryRouter } from 'react-router-dom';

const { getPage } = vi.hoisted(() => ({ getPage: vi.fn() }));
vi.mock('../../data/service', () => ({
  default: class {
    GetKeyPage = getPage;
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
