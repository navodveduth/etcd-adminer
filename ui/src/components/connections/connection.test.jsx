import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Connection from './connection';
import { SessionStore } from '../../storage/session';

const { authenticate } = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('../../data/service', () => ({
  default: class {
    TestConnection = authenticate;
    Logout = async () => {};
  },
}));

it('reauthenticates saved metadata without storing the password and supports disconnect', async () => {
  const user = userEvent.setup();
  authenticate.mockResolvedValue(true);
  const store = new SessionStore();
  store.Add({ Name: 'saved', BackEnd: 'cluster', Endpoints: [], UserName: 'alice' });
  render(
    <MemoryRouter>
      <Connection />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Open workspace' }));
  const username = screen.getByLabelText('Username');
  expect(username).toHaveValue('alice');
  expect(username).toHaveAttribute('name', 'username');
  expect(username).toHaveAttribute('autocomplete', 'username');
  expect(username).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Password')).toHaveAttribute('name', 'password');
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  expect(username.closest('form')).toHaveAttribute('autocomplete', 'on');
  await user.type(screen.getByLabelText('Password'), 'ephemeral-password');
  await user.click(screen.getByRole('button', { name: 'Authenticate' }));
  await waitFor(() => expect(store.GetActiveSession()?.UserName).toBe('alice'));
  expect(authenticate).toHaveBeenCalledWith(
    'alice',
    'ephemeral-password',
    'cluster',
    expect.any(AbortSignal),
    { profile: 'saved', remember: true },
  );
  expect(localStorage.getItem('sessions')).not.toContain('ephemeral-password');
  await user.click(await screen.findByRole('button', { name: 'Disconnect all' }));
  await user.click(
    within(screen.getByRole('dialog', { name: 'Disconnect all connections?' })).getByRole(
      'button',
      { name: 'Disconnect all' },
    ),
  );
  await waitFor(() => expect(store.GetActiveSession()).toBeUndefined());
});

it('shows searchable profile cards with a safe actions menu', async () => {
  const user = userEvent.setup();
  const store = new SessionStore();
  store.Add({
    Name: 'Development',
    BackEnd: 'DEV',
    Endpoints: ['http://dev:2379'],
    UserName: 'alice',
  });
  store.Add({
    Name: 'Production',
    BackEnd: 'PROD',
    Endpoints: ['https://prod:2379'],
    UserName: 'bob',
  });
  render(
    <MemoryRouter>
      <Connection />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.queryByText('Saved profile')).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  const card = screen.getByRole('article', { name: 'Development' });
  expect(within(card).getByText('http://dev:2379')).toBeInTheDocument();
  await user.click(within(card).getByRole('button', { name: 'Actions for Development' }));
  expect(screen.getByRole('menuitem', { name: 'Edit / diagnose' })).toHaveAttribute(
    'href',
    '/connection/new?edit=Development',
  );
  await user.click(screen.getByRole('menuitem', { name: 'Delete profile', exact: true }));
  expect(store.Get('Development')).toBeDefined();
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await user.type(screen.getByLabelText('Search connections'), 'bob');
  expect(screen.queryByRole('article', { name: 'Development' })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Production' })).toBeInTheDocument();
});
