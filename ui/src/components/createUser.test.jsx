import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import CreateUser from './createUser';

const { roles, create } = vi.hoisted(() => ({ roles: vi.fn(), create: vi.fn() }));
vi.mock('../data/service', () => ({ default: class { GetRoles = roles; CreateUser = create; } }));

it('fetches roles once and waits for confirmed creation before showing success', async () => {
    const user = userEvent.setup();
    roles.mockResolvedValue(['root', 'reader']);
    let finish;
    create.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<CreateUser />);
    await waitFor(() => expect(roles).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText(/User Name/), 'new-person');
    await user.type(screen.getByLabelText('Password'), 'new-password');
    await user.type(screen.getByLabelText('Confirm password'), 'new-password');
    await user.click(screen.getByRole('button', { name: 'Create user' }));
    expect(screen.getByRole('button', { name: 'Creating user…' })).toBeDisabled();
    expect(screen.queryByText('User created Successfully')).not.toBeInTheDocument();
    await act(async () => finish(true));
    expect(await screen.findByText('User created Successfully')).toBeInTheDocument();
    expect(roles).toHaveBeenCalledTimes(1);
});
