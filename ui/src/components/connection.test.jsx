import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Connection from './connection';
import { SessionStore } from '../storage/session';

const { authenticate } = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('../data/service', () => ({ default: class { TestConnection = authenticate; } }));

it('reauthenticates saved metadata without storing the password and supports disconnect', async () => {
    const user = userEvent.setup();
    authenticate.mockResolvedValue(true);
    const store = new SessionStore();
    store.Add({ Name: 'saved', BackEnd: 'cluster', Endpoints: [], UserName: 'alice' });
    render(<MemoryRouter><Connection /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.type(screen.getByLabelText('Password'), 'ephemeral-password');
    await user.click(screen.getByRole('button', { name: 'Authenticate' }));
    await waitFor(() => expect(store.GetActiveSession()?.UserName).toBe('alice'));
    expect(authenticate).toHaveBeenCalledWith('alice', 'ephemeral-password', 'cluster');
    expect(localStorage.getItem('sessions')).not.toContain('ephemeral-password');
    await user.click(await screen.findByRole('button', { name: 'Disconnect all' }));
    expect(store.GetActiveSession()).toBeUndefined();
});
