import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { vi, test, expect, beforeEach } from 'vitest';
import { useTheme } from '@mui/material/styles';
import userEvent from '@testing-library/user-event';

// Exercise the shell without coupling this smoke test to API availability.
vi.mock('./components/connections/newConnection', () => ({
  default: function ConnectionThemeProbe() {
    const theme = useTheme();
    return (
      <>
        <div>New connection</div>
        <output data-testid="primary-color">{theme.palette.primary.main}</output>
      </>
    );
  },
}));
const { getConfig } = vi.hoisted(() => ({ getConfig: vi.fn() }));
vi.mock('./data/service', () => ({
  default: class {
    GetConfig = getConfig;
  },
}));
beforeEach(() => {
  getConfig.mockReset();
  getConfig.mockResolvedValue({ clusters: [], readOnly: false });
});

test('closes shortcut help using the header close icon', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Shortcuts', exact: true }));
  const close = screen.getByRole('button', { name: 'Close help', exact: true });
  expect(close.querySelector('svg')).not.toBeNull();
  await user.click(close);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('renders an actionable empty connection screen', async () => {
  render(<App />);
  expect(screen.getByText('ETCD Adminer')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'No saved connections' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'New connection' })).toBeInTheDocument();
});

test('keeps mutation controls disabled when instance settings cannot be loaded', async () => {
  getConfig.mockRejectedValue(new Error('network unavailable'));
  render(<App />);
  expect(
    await screen.findByText('Could not load instance settings. Mutating controls are disabled.'),
  ).toBeInTheDocument();
});

test.each([
  ['light', '#1976d2'],
  ['dark', '#90caf9'],
])('preserves the previous blue palette in %s mode', async (mode, primary) => {
  localStorage.setItem('themeMode', mode);
  render(<App />);
  await userEvent.click(screen.getByRole('link', { name: 'New connection' }));
  expect(await screen.findByTestId('primary-color')).toHaveTextContent(primary);
});
