import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import UserInfo from './userInfo';

const calls = vi.hoisted(() => ({ fetch: vi.fn(), assign: vi.fn(), remove: vi.fn() }));
vi.mock('../../data/service', () => ({ default: class {
    FetchUser = calls.fetch; AssignRole = calls.assign; RemoveRole = calls.remove;
} }));

it('requires typed confirmation before granting root', async () => {
    calls.fetch.mockResolvedValue({ name: 'alice', roles: [] });
    calls.assign.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<MemoryRouter><UserInfo userName="alice" allRoles={['root']} /></MemoryRouter>);
    await screen.findByText('User Info: alice');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'root' }));
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
    expect(calls.assign).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Type GRANT ROOT to confirm'), 'GRANT ROOT');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(calls.assign).toHaveBeenCalledWith('alice', 'root', 'GRANT ROOT'));
});
