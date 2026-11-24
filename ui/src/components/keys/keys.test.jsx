import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import Keys from './keys';

const { getPage } = vi.hoisted(() => ({ getPage: vi.fn() }));
vi.mock('../../data/service', () => ({ default: class { GetKeyPage = getPage; } }));
vi.mock('./editor', () => ({ default: () => <div>Editor placeholder</div> }));

it('uses bounded server pages and explicit prefix queries instead of whole-tree reads', async () => {
    const user = userEvent.setup();
    getPage.mockResolvedValue({ items: [{ key: '/one', keyEncoding: 'utf8' }], revision: '7', hasMore: true, nextCursor: 'signed-next' });
    render(<Keys />);
    await screen.findByText('one');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(getPage).toHaveBeenCalledWith({ prefix: '', cursor: 'signed-next', limit: 100 }, expect.any(AbortSignal)));
    await user.type(screen.getByRole('textbox', { name: 'Key prefix' }), '/app/');
    await user.click(screen.getByRole('button', { name: 'Apply prefix' }));
    await waitFor(() => expect(getPage).toHaveBeenCalledWith({ prefix: '/app/', cursor: null, limit: 100 }, expect.any(AbortSignal)));
});
