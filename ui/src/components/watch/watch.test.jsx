import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Watch from './watch';

const { watch } = vi.hoisted(() => ({ watch: vi.fn() }));
vi.mock('../../data/service', () => ({ default: class { BindActiveSession = () => ({ WatchChanges: watch }); } }));

it('shows all events in one revision and cancels the stream on Stop', async () => {
    const user = userEvent.setup();
    let currentSignal;
    watch.mockImplementation((_query, onFrame, signal) => {
        currentSignal = signal;
        onFrame({ event: 'ready', data: { revision: '9007199254740992' } });
        onFrame({ event: 'changes', data: { revision: '9007199254740993', events: [
            { type: 'PUT', key: '/a', keyEncoding: 'utf8', revision: '9007199254740993' },
            { type: 'PUT', key: '/b', keyEncoding: 'utf8', revision: '9007199254740993' },
        ] } });
        return new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    });
    render(<MemoryRouter><Watch /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Start watching' }));
    expect(await screen.findByText('/a')).toBeInTheDocument();
    expect(screen.getByText('/b')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(currentSignal.aborted).toBe(true));
    expect(screen.getByText('Stopped')).toBeInTheDocument();
});
