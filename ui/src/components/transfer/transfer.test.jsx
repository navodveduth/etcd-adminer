import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Transfer from './transfer';

const batch = vi.hoisted(() => vi.fn());
vi.mock('../../data/service', () => ({ default: class { TransferBatch = batch; } }));
it('requires a fresh preview and typed count before deleting selected exact keys', async () => {
    const user = userEvent.setup();
    batch.mockResolvedValueOnce({ existing: 1, records: [{ keyBase64: 'L2E=', valueBase64: '', expectedRevision: '42' }] }).mockResolvedValueOnce({ applied: true, revision: '43' });
    render(<MemoryRouter initialEntries={[{ pathname: '/transfer', state: { keys: ['/a'] } }]}><Transfer /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Apply atomic batch' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Validate & preview' }));
    expect(await screen.findByRole('button', { name: 'Apply atomic batch' })).toBeDisabled();
    await user.type(screen.getByLabelText('Type DELETE 1 to confirm'), 'DELETE 1');
    await user.click(screen.getByRole('button', { name: 'Apply atomic batch' }));
    expect(await screen.findByText(/operations committed atomically at revision 43/)).toBeInTheDocument();
    expect(batch.mock.calls[1][0]).toMatchObject({ operation: 'delete', confirmation: 'DELETE 1', records: [{ expectedRevision: '42' }] });
});
