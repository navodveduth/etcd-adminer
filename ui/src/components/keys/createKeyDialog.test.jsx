import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import CreateKeyDialog from './createKeyDialog';
import { ReadOnlyContext } from '../../readOnly';

const put = vi.hoisted(() => vi.fn());
vi.mock('../../data/service', () => ({
  default: class {
    PutKey = put;
  },
}));

it('creates an exact full path and value with a create-only revision', async () => {
  put.mockReset().mockResolvedValue(true);
  const user = userEvent.setup();
  const created = vi.fn();
  render(<CreateKeyDialog onCreated={created} onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
  const key = '/system/automation-services/driver-simulator/common/redis/pool-timeout';
  await user.type(screen.getByLabelText('Full key path'), key);
  await user.type(screen.getByLabelText('Value'), ' 5s\n');
  await user.click(screen.getByRole('button', { name: 'Create key' }));
  expect(put).toHaveBeenCalledWith(key, ' 5s\n', '0', undefined, expect.any(AbortSignal));
  expect(created).toHaveBeenCalledWith(key);
});

it('allows an empty value and retains input on a collision without offering overwrite', async () => {
  put.mockReset().mockRejectedValue({ response: { status: 409 } });
  const user = userEvent.setup();
  render(<CreateKeyDialog initialKey="/existing" onCreated={vi.fn()} onClose={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Create key' }));
  expect(await screen.findByText(/This key already exists/)).toBeInTheDocument();
  expect(screen.getByLabelText('Full key path')).toHaveValue('/existing');
  expect(screen.getByLabelText('Value')).toHaveValue('');
  expect(put).toHaveBeenCalledWith('/existing', '', '0', undefined, expect.any(AbortSignal));
});

it('cancels a pending request without treating a late response as success', async () => {
  let finish;
  let signal;
  put.mockReset().mockImplementation((_key, _value, _revision, _lease, requestSignal) => {
    signal = requestSignal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const user = userEvent.setup();
  const created = vi.fn();
  render(<CreateKeyDialog initialKey="/new" onCreated={created} onClose={vi.fn()} />);
  await user.type(screen.getByLabelText('Value'), 'preserve me');
  await user.click(screen.getByRole('button', { name: 'Create key' }));
  expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel request' }));
  expect(signal.aborted).toBe(true);
  expect(screen.getByText(/key may already have been created/)).toBeInTheDocument();
  await act(async () => finish(true));
  expect(created).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Value')).toHaveValue('preserve me');
});

it('asks before discarding entered values', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(<CreateKeyDialog onCreated={vi.fn()} onClose={close} />);
  await user.type(screen.getByLabelText('Value'), 'unsaved');
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  const dialog = screen.getByRole('dialog', { name: 'Discard new key input?' });
  expect(close).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Discard input' }));
  expect(close).toHaveBeenCalledOnce();
});

it('disables creation in read-only mode', () => {
  put.mockReset();
  render(
    <ReadOnlyContext.Provider value>
      <CreateKeyDialog initialKey="/new" onCreated={vi.fn()} onClose={vi.fn()} />
    </ReadOnlyContext.Provider>,
  );
  expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
  expect(put).not.toHaveBeenCalled();
});

it('checks UTF-8 byte limits rather than character counts before submitting', () => {
  put.mockReset();
  render(<CreateKeyDialog initialKey="/new" onCreated={vi.fn()} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'é'.repeat(65537) } });
  expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Value'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Create key' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Full key path'), { target: { value: 'é'.repeat(4097) } });
  expect(screen.getByText('Key exceeds 8192 UTF-8 bytes.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
  expect(put).not.toHaveBeenCalled();
});
