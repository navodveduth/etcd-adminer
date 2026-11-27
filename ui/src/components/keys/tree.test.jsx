import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import FSNavigator from './tree';
import { ReadOnlyContext } from '../../readOnly';
import { buildKeyTree } from '../../data/keyTree';

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

it.each([
  'tab\tname',
  'line\nbreak',
  'carriage\rreturn',
  'quote"name',
  'slash\\name',
  '日本語[folder]',
])('keeps unsafe key bytes out of DOM IDs: %j', async (folder) => {
  const user = userEvent.setup();
  const onKeyClick = vi.fn();
  const path = `/${folder}/value"\\\n`;
  const tree = buildKeyTree([{ key: path }]);
  const { container } = render(<FSNavigator keys={tree} onKeyClick={onKeyClick} />);
  const folderItem = screen.getAllByRole('treeitem')[1];
  await user.click(folderItem.querySelector('.MuiTreeItem-label'));
  const file = screen.getAllByRole('treeitem').at(-1);
  await user.click(file.querySelector('.MuiTreeItem-label'));
  expect(onKeyClick).toHaveBeenLastCalledWith(path);
  for (const item of container.querySelectorAll('[role="treeitem"]')) {
    expect(item.id).toMatch(/^key-tree-[a-zA-Z0-9_-]+$/);
  }
  await user.click(folderItem.querySelector('.MuiTreeItem-label'));
  await user.click(folderItem.querySelector('.MuiTreeItem-label'));
  expect(screen.getAllByRole('treeitem')).toHaveLength(3);
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

it('mounts only expanded branches of a large folder index', async () => {
  const user = userEvent.setup();
  const tree = buildKeyTree(
    Array.from({ length: 6194 }, (_, index) => ({
      key: `/system/driver-services/project-${String(Math.floor(index / 100)).padStart(2, '0')}/key-${index}`,
    })),
  );
  const { container } = render(<FSNavigator keys={tree} />);
  expect(screen.getByText('system')).toBeVisible();
  expect(screen.queryByText('driver-services')).not.toBeInTheDocument();
  expect(container.querySelectorAll('[role="treeitem"]').length).toBeLessThan(10);
  await user.click(screen.getByText('system'));
  expect(screen.getByText('driver-services')).toBeVisible();
  expect(screen.queryByText('project-00')).not.toBeInTheDocument();
  await user.click(screen.getByText('driver-services'));
  expect(screen.getByText('project-00')).toBeVisible();
  expect(screen.getByText('project-61')).toBeVisible();
  expect(screen.queryByText('key-0')).not.toBeInTheDocument();
  expect(container.querySelectorAll('[role="treeitem"]').length).toBeLessThan(150);
  await user.click(screen.getByText('project-00'));
  expect(screen.getByText('key-0')).toBeVisible();
  await user.click(screen.getByText('project-00'));
  expect(screen.queryByText('key-0')).not.toBeInTheDocument();
});

it('shows directories before keys and bounds large expanded branches with explicit continuation', async () => {
  const user = userEvent.setup();
  const tree = buildKeyTree([
    { key: '/a-file' },
    ...Array.from({ length: 150 }, (_, index) => ({ key: `/z-folder/key-${index}` })),
  ]);
  render(<FSNavigator keys={tree} />);
  const treeItems = screen.getAllByRole('treeitem');
  expect(treeItems[1]).toHaveTextContent('z-folder');
  expect(treeItems[2]).toHaveTextContent('a-file');
  await user.click(screen.getByText('z-folder'));
  expect(screen.getByText('key-99')).toBeVisible();
  expect(screen.queryByText('key-100')).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Show more in z-folder (100 of 150 entries)' }),
  );
  expect(screen.getByText('key-149')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Show more in z-folder/ })).not.toBeInTheDocument();
});
