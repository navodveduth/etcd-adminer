import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import FSNavigator from './tree';
import { ReadOnlyContext } from '../../readOnly';

const keys = {
  id: 1,
  name: '/',
  type: 'directory',
  abspath: '',
  children: [{ id: 2, name: 'config', type: 'file', abspath: '/config' }],
};

it('selects the exact key without inspecting DOM parents', () => {
  const onKeyClick = vi.fn();
  render(<FSNavigator keys={keys} onKeyClick={onKeyClick} />);
  fireEvent.click(screen.getByText('config'));
  expect(onKeyClick).toHaveBeenCalledWith('/config');
});

it('offers folder duplication for persisted directories, not files or read-only connections', async () => {
  const user = userEvent.setup();
  const folders = {
    ...keys,
    children: [
      ...keys.children,
      { id: 3, name: 't0002', type: 'directory', abspath: '/t0002', children: [] },
    ],
  };
  const view = render(<FSNavigator keys={folders} fetchKeys={vi.fn()} />);
  fireEvent.contextMenu(screen.getByText('config'));
  expect(screen.getByRole('menuitem', { name: 'Duplicate folder…' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await user.keyboard('{Escape}');
  fireEvent.contextMenu(screen.getByText('t0002'));
  await user.click(screen.getByRole('menuitem', { name: 'Duplicate folder…' }));
  expect(screen.getByRole('dialog', { name: 'Duplicate folder' })).toBeInTheDocument();
  expect(screen.getByLabelText('Destination folder path')).toHaveValue('/t0002-copy');
  view.unmount();
  render(
    <ReadOnlyContext.Provider value>
      <FSNavigator keys={folders} />
    </ReadOnlyContext.Provider>,
  );
  fireEvent.contextMenu(screen.getByText('t0002'));
  expect(screen.getByRole('menuitem', { name: 'Duplicate folder…' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
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
