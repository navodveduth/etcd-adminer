import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import FSNavigator from './tree';

const keys = {
  id: 1, name: '/', type: 'directory', abspath: '', children: [
    { id: 2, name: 'config', type: 'file', abspath: '/config' },
  ],
};

it('selects the exact key without inspecting DOM parents', () => {
  const onKeyClick = vi.fn();
  render(<FSNavigator keys={keys} onKeyClick={onKeyClick} />);
  fireEvent.click(screen.getByText('config'));
  expect(onKeyClick).toHaveBeenCalledWith('/config');
});

it('supports keyboard selection and the context-menu key', async () => {
  const onKeyClick = vi.fn();
  render(<FSNavigator keys={keys} onKeyClick={onKeyClick} />);
  const file = screen.getByText('config').closest('[role="treeitem"]');
  fireEvent.keyDown(file, { key: 'Enter' });
  expect(onKeyClick).toHaveBeenCalledWith('/config');
  fireEvent.keyDown(file, { key: 'F10', shiftKey: true });
  expect(await screen.findByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
});

it('runs explicit menu actions and dismisses safely with Escape', async () => {
  const user = userEvent.setup();
  const fetchKeys = vi.fn();
  render(<FSNavigator keys={keys} fetchKeys={fetchKeys} />);
  fireEvent.contextMenu(screen.getByText('config'));
  await user.click(screen.getByText('Refresh'));
  expect(fetchKeys).toHaveBeenCalledTimes(1);
  fireEvent.contextMenu(screen.getByText('config'));
  await user.keyboard('{Escape}');
  expect(fetchKeys).toHaveBeenCalledTimes(1);
});
