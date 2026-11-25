import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SessionStore } from '../../storage/session';
import NewConnection from './newConnection';
const { testConnection } = vi.hoisted(() => ({ testConnection: vi.fn() }));

vi.mock('../../data/service', () => ({
  default: class {
    GetConfig = async () => ({ clusters: [{ name: 'dev', endpoints: ['https://dev:2379'] }] });
    TestConnection = testConnection;
  },
}));
beforeEach(() => {
  testConnection.mockReset().mockResolvedValue(true);
});

it('prefills profile metadata but requires a fresh test after every credential change', async () => {
  const store = new SessionStore();
  store.Add({ Name: 'saved', BackEnd: 'dev', UserName: 'alice', Endpoints: [] });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/connection/new?edit=saved']}>
      <NewConnection />
    </MemoryRouter>,
  );
  expect(screen.getByLabelText(/Profile name/)).toHaveValue('saved');
  expect(screen.getByLabelText('Password')).toHaveValue('');
  expect(screen.getByLabelText(/Username/)).toHaveAttribute('name', 'username');
  expect(screen.getByLabelText(/Username/)).toHaveAttribute('autocomplete', 'username');
  expect(screen.getByLabelText('Password')).toHaveAttribute('name', 'password');
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  expect(screen.getByLabelText('Password').closest('form')).toHaveAttribute('autocomplete', 'on');
  const save = screen.getByRole('button', { name: 'Save & open workspace' });
  expect(save).toBeDisabled();
  await user.type(screen.getByLabelText('Password'), 'tab-memory-only');
  await user.click(screen.getByRole('button', { name: 'Test & diagnose' }));
  expect(await screen.findByText(/Authentication succeeded in/)).toBeInTheDocument();
  expect(save).toBeEnabled();
  await user.type(screen.getByLabelText(/Username/), '2');
  expect(save).toBeDisabled();
  expect(localStorage.getItem('sessions')).not.toContain('tab-memory-only');
});

it('explains an origin rejection without blaming or clearing the entered credentials', async () => {
  const store = new SessionStore();
  store.Add({ Name: 'saved', BackEnd: 'dev', UserName: 'alice', Endpoints: [] });
  testConnection.mockRejectedValue({
    response: {
      status: 403,
      data: { code: 'invalid_origin', message: 'cross-origin mutations are not allowed' },
    },
  });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/connection/new?edit=saved']}>
      <NewConnection />
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText('Password'), 'test-password');
  await user.click(screen.getByRole('button', { name: 'Test & diagnose' }));
  expect(await screen.findByText(/Configure http.publicOrigin/)).toBeInTheDocument();
  expect(screen.queryByText(/Authentication rejected/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toHaveValue('test-password');
  expect(screen.getByRole('button', { name: 'Save & open workspace' })).toBeDisabled();
});
