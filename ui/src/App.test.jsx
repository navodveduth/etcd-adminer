import { render, screen } from '@testing-library/react';
import App from './App';
import { vi, test, expect, beforeEach } from 'vitest';
import { useTheme } from '@mui/material/styles';

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

test('renders the application and redirects an empty profile store', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'ETCD Adminer' })).toBeInTheDocument();
  expect(await screen.findByText('New connection')).toBeInTheDocument();
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
  expect(await screen.findByTestId('primary-color')).toHaveTextContent(primary);
});
