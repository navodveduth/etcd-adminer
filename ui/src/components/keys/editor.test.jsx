import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import EditorComponent from './editor';
import { ReadOnlyContext } from '../../readOnly';

const { fetchKey, putKey } = vi.hoisted(() => ({ fetchKey: vi.fn(), putKey: vi.fn() }));
vi.mock('../../data/service', () => ({
  default: class {
    FetchKey = fetchKey;
    PutKey = putKey;
  },
}));
vi.mock('./monacoEditor', () => ({
  default: ({ value, onChange, options }) => (
    <textarea
      aria-label="Value"
      value={value}
      readOnly={options.readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
beforeEach(() => {
  fetchKey.mockReset();
  putKey.mockReset();
});

it('ignores an old response after selecting another key', async () => {
  let resolveFirst;
  fetchKey.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
  );
  fetchKey.mockResolvedValueOnce({ key: '/second', value: 'second value', modRevision: '42' });
  const { rerender } = render(<EditorComponent etcdKey="/first" />);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  rerender(<EditorComponent etcdKey="/second" />);
  expect(await screen.findByRole('textbox', { name: 'Value' })).toHaveValue('second value');
  await act(async () => resolveFirst({ key: '/first', value: 'stale value', modRevision: '1' }));
  expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('second value');
});

it('saves with the exact revision string and preserves the draft on conflict', async () => {
  const user = userEvent.setup();
  fetchKey.mockResolvedValue({
    key: '/key',
    value: 'old',
    modRevision: '9007199254740993',
    lease: '123',
  });
  putKey.mockRejectedValue({ response: { status: 409 } });
  render(<EditorComponent etcdKey="/key" />);
  const input = await screen.findByRole('textbox', { name: 'Value' });
  await user.clear(input);
  await user.type(input, 'draft');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(putKey).toHaveBeenCalledWith('/key', 'draft', '9007199254740993'));
  expect(await screen.findByRole('alert')).toHaveTextContent('key changed');
  expect(input).toHaveValue('draft');
});

it('enables Save only while an existing value differs and blocks unchanged keyboard saves', async () => {
  const user = userEvent.setup();
  fetchKey.mockResolvedValue({ key: '/key', value: 'original', modRevision: '42' });
  render(<EditorComponent etcdKey="/key" />);
  const input = await screen.findByRole('textbox', { name: 'Value' });
  const save = screen.getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();
  fireEvent.keyDown(input, { key: 's', ctrlKey: true });
  expect(putKey).not.toHaveBeenCalled();
  await user.type(input, ' changed');
  expect(save).toBeEnabled();
  await user.clear(input);
  await user.type(input, 'original');
  expect(save).toBeDisabled();
  fireEvent.keyDown(input, { key: 's', metaKey: true });
  expect(putKey).not.toHaveBeenCalled();
});

it('allows an explicit new key to be created with an empty value', async () => {
  const user = userEvent.setup();
  putKey.mockResolvedValue(true);
  render(<EditorComponent etcdKey="/new-empty" isNewKey />);
  const save = screen.getByRole('button', { name: 'Save' });
  await waitFor(() => expect(save).toBeEnabled());
  await user.click(save);
  expect(putKey).toHaveBeenCalledWith('/new-empty', '', '0');
});

it('resets consecutive new keys and never fetches a draft from etcd', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<EditorComponent etcdKey="/new-one" isNewKey />);
  await user.type(await screen.findByRole('textbox', { name: 'Value' }), 'first draft');
  rerender(<EditorComponent etcdKey="/new-two" isNewKey />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue(''));
  expect(fetchKey).not.toHaveBeenCalled();
});

it('does not allow saving when a key could not be loaded', async () => {
  fetchKey.mockRejectedValue(new Error('network failure'));
  render(<EditorComponent etcdKey="/key" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(putKey).not.toHaveBeenCalled();
});

it.each([
  [],
  { keys: [] },
  { key: '/other', value: 'wrong key', modRevision: '42' },
  { key: '/key', modRevision: '42' },
  { key: '/key', value: '', modRevision: '0' },
  { key: '/key', value: '', modRevision: 42 },
])(
  'rejects malformed exact-key responses instead of enabling a blank draft: %j',
  async (response) => {
    fetchKey.mockResolvedValue(response);
    render(<EditorComponent etcdKey="/key" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this key');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    expect(putKey).not.toHaveBeenCalled();
  },
);

it('loads an empty value as a saved record with its exact revision', async () => {
  const key = 'al-tam\n/system/config';
  fetchKey.mockResolvedValue({ key, value: '', modRevision: '31402' });
  render(<EditorComponent etcdKey={key} />);
  expect(await screen.findByRole('textbox', { name: 'Value' })).toHaveValue('');
  expect(screen.getByText('Saved value')).toBeInTheDocument();
  expect(screen.getByText('31402')).toBeInTheDocument();
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
});

it('disables mutation controls and editing for a read-only instance', async () => {
  fetchKey.mockResolvedValue({ key: '/key', value: 'visible', modRevision: '42' });
  render(
    <ReadOnlyContext.Provider value={true}>
      <EditorComponent etcdKey="/key" />
    </ReadOnlyContext.Provider>,
  );
  expect(await screen.findByRole('textbox', { name: 'Value' })).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(putKey).not.toHaveBeenCalled();
});

it('keeps expiration changes available in the compact options section', async () => {
  const user = userEvent.setup();
  fetchKey.mockResolvedValue({ key: '/key', value: 'value', modRevision: '42', lease: '123' });
  putKey.mockResolvedValue(true);
  render(<EditorComponent etcdKey="/key" />);
  await screen.findByRole('textbox', { name: 'Value' });
  await user.click(screen.getByText('Expiration on save · Preserve lease'));
  await user.click(screen.getByRole('combobox', { name: 'Expiration on save' }));
  await user.click(screen.getByRole('option', { name: 'Attach a lease ID' }));
  await user.type(screen.getByLabelText('Lease ID'), '456');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(putKey).toHaveBeenCalledWith('/key', 'value', '42', '456'));
});
