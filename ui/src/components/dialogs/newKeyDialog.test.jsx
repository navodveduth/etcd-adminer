import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import NewKeyDialog from './newKeyDialog';

it('previews the exact path, submits on Enter and clears the name on reopening', async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  const close = vi.fn();
  const view = render(
    <NewKeyDialog open prefix="/app/" handleSubmit={submit} handleClose={close} />,
  );
  await user.click(screen.getByRole('button', { name: 'Create draft' }));
  expect(screen.getByText('Enter a nonempty name.')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Name'), ' Exact Name ');
  expect(screen.getByText('/app/ Exact Name')).toHaveTextContent('/app/ Exact Name');
  await user.keyboard('{Enter}');
  expect(submit).toHaveBeenCalledWith(' Exact Name ');
  view.rerender(
    <NewKeyDialog open={false} prefix="/app/" handleSubmit={submit} handleClose={close} />,
  );
  view.rerender(<NewKeyDialog open prefix="/app/" handleSubmit={submit} handleClose={close} />);
  expect(screen.getByLabelText('Name')).toHaveValue('');
  await user.keyboard('{Escape}');
  expect(close).toHaveBeenCalled();
});
