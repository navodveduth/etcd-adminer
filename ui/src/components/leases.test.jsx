import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Leases from './leases';
import { ReadOnlyContext } from '../readOnly';

const calls = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), grant: vi.fn(), renew: vi.fn(), revoke: vi.fn() }));
vi.mock('../data/service', () => ({ default: class {
    GetLeases = calls.list; GetLease = calls.detail; GrantLease = calls.grant;
    RenewLease = calls.renew; RevokeLease = calls.revoke;
} }));

it('requires the exact lease ID before destructive revocation', async () => {
    const user = userEvent.setup();
    calls.list.mockResolvedValue({ ids: ['123'], truncated: false });
    calls.detail.mockResolvedValue({ id: '123', ttl: 50, grantedTTL: 60, keyCount: 2, keys: [] });
    calls.revoke.mockResolvedValue({});
    render(<Leases />);
    await user.click(await screen.findByRole('button', { name: 'Revoke lease…' }));
    const revoke = screen.getByRole('button', { name: 'Revoke and delete keys' });
    expect(revoke).toBeDisabled();
    expect(screen.getByText(/ALL 2 attached keys/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Type the lease ID to confirm'), '123');
    expect(revoke).toBeEnabled();
    await user.click(revoke);
    await waitFor(() => expect(calls.revoke).toHaveBeenCalledWith('123'));
});

it('shows lease details but blocks creation and renewal in read-only mode', async () => {
    calls.list.mockResolvedValue({ ids: ['123'], truncated: false });
    calls.detail.mockResolvedValue({ id: '123', ttl: 50, grantedTTL: 60, keyCount: 0, keys: [] });
    render(<ReadOnlyContext.Provider value={true}><Leases /></ReadOnlyContext.Provider>);
    expect(screen.getByRole('button', { name: 'Create lease' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: 'Renew once' })).toBeDisabled();
});

it('owns optional renewal in the mounted workspace and cancels it on teardown', async () => {
    const user = userEvent.setup();
    calls.list.mockResolvedValue({ ids: ['123'], truncated: false });
    calls.detail.mockResolvedValue({ id: '123', ttl: 50, grantedTTL: 60, keyCount: 0, keys: [] });
    let renewalSignal;
    calls.renew.mockImplementation((_id, signal) => { renewalSignal = signal; return new Promise(() => {}); });
    const view = render(<Leases />);
    await user.click(await screen.findByRole('checkbox', { name: 'Automatically renew in this workspace (15-minute maximum)' }));
    await waitFor(() => expect(renewalSignal).toBeDefined());
    expect(renewalSignal.aborted).toBe(false);
    view.unmount();
    expect(renewalSignal.aborted).toBe(true);
});
