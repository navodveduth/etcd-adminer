import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import DuplicateFolderDialog from './duplicateFolderDialog';
import { ReadOnlyContext } from '../../readOnly';

const calls = vi.hoisted(() => ({ exportPage: vi.fn(), batch: vi.fn() }));
vi.mock('../../data/service', () => ({
  default: class {
    ExportPage = calls.exportPage;
    TransferBatch = calls.batch;
  },
}));
const sourceRecord = { keyBase64: btoa('/t0002/util/name'), valueBase64: btoa('unchanged t0002') };

function setup() {
  calls.exportPage
    .mockReset()
    .mockResolvedValue({ revision: '40', hasMore: false, records: [sourceRecord] });
  calls.batch.mockReset().mockImplementation(async (batch) => ({
    applied: !batch.dryRun,
    existing: 0,
    records: batch.records.map((record) => ({ ...record, expectedRevision: '0' })),
  }));
}

it('requires a fresh preview and typed count before copying without overwrites', async () => {
  setup();
  const user = userEvent.setup();
  const copied = vi.fn();
  render(<DuplicateFolderDialog source="/t0002" onClose={vi.fn()} onCopied={copied} />);
  expect(screen.getByLabelText('Destination folder path')).toHaveValue('/t0002-copy');
  await user.click(screen.getByRole('button', { name: 'Preview copy', exact: true }));
  expect(await screen.findByText('/t0002-copy/util/name')).toBeInTheDocument();
  const apply = screen.getByRole('button', { name: 'Duplicate folder', exact: true });
  expect(apply).toBeDisabled();
  expect(calls.batch.mock.calls.every(([batch]) => batch.dryRun)).toBe(true);
  await user.type(screen.getByLabelText('Type COPY 1 to confirm'), 'COPY 1');
  await user.click(apply);
  expect(await screen.findByText(/1 keys copied to/)).toBeInTheDocument();
  expect(copied).toHaveBeenCalledOnce();
  expect(calls.batch.mock.calls[1][0]).toMatchObject({
    dryRun: false,
    policy: 'create',
    confirmation: 'IMPORT 1',
    records: [
      {
        keyBase64: btoa('/t0002-copy/util/name'),
        valueBase64: sourceRecord.valueBase64,
        expectedRevision: '0',
      },
    ],
  });
});

it('invalidates preview and confirmation after editing the destination', async () => {
  setup();
  const user = userEvent.setup();
  render(<DuplicateFolderDialog source="/t0002" onClose={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Preview copy' }));
  await user.type(await screen.findByLabelText('Type COPY 1 to confirm'), 'COPY 1');
  await user.type(screen.getByLabelText('Destination folder path'), '-other');
  expect(
    screen.queryByRole('button', { name: 'Duplicate folder', exact: true }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Type COPY 1 to confirm')).not.toBeInTheDocument();
  expect(calls.batch).toHaveBeenCalledOnce();
});

it('reports uncertain submitted outcomes after cancelling and ignores late responses', async () => {
  setup();
  const user = userEvent.setup();
  const copied = vi.fn();
  let finish;
  let signal;
  calls.batch.mockImplementation(async (batch, requestSignal) => {
    if (batch.dryRun)
      return {
        existing: 0,
        records: batch.records.map((record) => ({ ...record, expectedRevision: '0' })),
      };
    signal = requestSignal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  render(<DuplicateFolderDialog source="/t0002" onClose={vi.fn()} onCopied={copied} />);
  await user.click(screen.getByRole('button', { name: 'Preview copy' }));
  await user.type(await screen.findByLabelText('Type COPY 1 to confirm'), 'COPY 1');
  await user.click(screen.getByRole('button', { name: 'Duplicate folder', exact: true }));
  await waitFor(() => expect(signal).toBeDefined());
  await user.click(screen.getByRole('button', { name: 'Cancel request' }));
  expect(signal.aborted).toBe(true);
  expect(screen.getByText(/last submitted batch may also have committed/)).toBeInTheDocument();
  await act(async () => finish({ applied: true }));
  expect(copied).not.toHaveBeenCalled();
});

it('blocks copying in read-only mode', () => {
  setup();
  render(
    <ReadOnlyContext.Provider value>
      <DuplicateFolderDialog source="/t0002" onClose={vi.fn()} />
    </ReadOnlyContext.Provider>,
  );
  expect(screen.getByRole('button', { name: 'Preview copy' })).toBeDisabled();
  expect(calls.exportPage).not.toHaveBeenCalled();
});
