import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { SessionStore } from '../../storage/session';
import NewConnection from './newConnection';

vi.mock('../../data/service', () => ({
  default: class {
    GetConfig = async () => ({ clusters: [{ name: 'dev', endpoints: ['https://dev:2379'] }] });
    TestConnection = async () => true;
  },
}));

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
