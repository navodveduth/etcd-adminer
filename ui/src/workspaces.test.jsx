import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Workspace from './workspaces';
import { SessionStore } from './storage/session';
import { useDataService } from './data/context';

const calls = vi.hoisted(() => ({ profiles: [] }));
vi.mock('./data/service', () => ({ default: class {
    constructor(store) { this.store = store; }
    GetCapabilities = async () => ({ administrator: false, write: true, read: true });
    Identity = () => this.store.GetActiveSession();
} }));
vi.mock('./components/keys', () => ({ default: function TestKeys() {
    const service = useDataService();
    const identity = service.Identity();
    const [draft, setDraft] = useState('');
    calls.profiles.push(identity.BackEnd);
    return <label>Draft for {identity.BackEnd}<input aria-label={`Draft for ${identity.BackEnd}`} value={draft} onChange={(event) => setDraft(event.target.value)} /></label>;
} }));
vi.mock('./components/transfer', () => ({ default: () => <h2>Transfer page</h2> }));

it('isolates connection identity and preserves drafts across page and workspace switches', async () => {
    const store = new SessionStore();
    const a = { Name: 'first', BackEnd: 'dev', UserName: 'alice', Password: 'dev-only' };
    const b = { Name: 'second', BackEnd: 'prod', UserName: 'bob', Password: 'prod-only' };
    store.Add(a); store.Add(b); store.SetActiveSession(b);
    const user = userEvent.setup();
    render(<><section aria-label="First workspace"><Workspace profile={a} /></section><section aria-label="Second workspace"><Workspace profile={b} /></section></>);
    await user.type(await screen.findByLabelText('Draft for dev'), 'unsaved dev');
    await user.type(await screen.findByLabelText('Draft for prod'), 'unsaved prod');
    const first = within(screen.getByRole('region', { name: 'First workspace' }));
    await user.click(first.getByRole('link', { name: 'Import / export' }));
    expect(await first.findByText('Transfer page')).toBeInTheDocument();
    await user.click(first.getByRole('link', { name: 'Keys' }));
    expect(screen.getByLabelText('Draft for dev')).toHaveValue('unsaved dev');
    expect(screen.getByLabelText('Draft for prod')).toHaveValue('unsaved prod');
    expect(first.getByText('Roles').closest('a')).toHaveAttribute('aria-disabled', 'true');
    expect(calls.profiles).toContain('dev'); expect(calls.profiles).toContain('prod');
});
