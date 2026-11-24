import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Roles from './roles';

const { list, detail } = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock('../../data/service', () => ({
  default: class {
    ListRoles = list;
    GetRole = detail;
  },
}));

it('explains unrestricted root access without offering root mutations', async () => {
  list.mockResolvedValue({ roles: ['root'] });
  detail.mockResolvedValue({ name: 'root', protected: true, permissions: [] });
  render(
    <MemoryRouter>
      <Roles />
    </MemoryRouter>,
  );
  expect(await screen.findByText(/built-in root role has unrestricted/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete role…' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save permission' })).not.toBeInTheDocument();
});
