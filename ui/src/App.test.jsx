import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { vi, test, expect, beforeEach } from 'vitest';
import { useTheme } from '@mui/material/styles';
import userEvent from '@testing-library/user-event';
import { SessionStore } from './storage/session';

vi.mock('./workspaces', () => ({ default: () => <div>Opened test workspace</div> }));

// Exercise the shell without coupling this smoke test to API availability.
vi.mock('./components/connections/newConnection', () => ({
  default: function ConnectionThemeProbe({ forceRefreshNav }) {
    const theme = useTheme();
    return (
      <>
        <div>New connection</div>
        <output data-testid="primary-color">{theme.palette.primary.main}</output>
        <button onClick={() => forceRefreshNav()}>Open test workspace</button>
      </>
    );
  },
}));
const { getConfig, getSessions } = vi.hoisted(() => ({ getConfig: vi.fn(), getSessions: vi.fn() }));
vi.mock('./data/service', () => ({
  default: class {
    GetConfig = getConfig;
    GetSessions = getSessions;
  },
}));
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  getConfig.mockReset();
  getSessions.mockReset().mockResolvedValue({ connections: [] });
  getConfig.mockResolvedValue({ clusters: [], readOnly: false });
});

test('opens a workspace when secure-context randomUUID is unavailable', async () => {
  const randomUUID = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new Error('randomUUID is unavailable on HTTP origins');
  });
  try {
    const store = new SessionStore();
    const profile = { Name: 'http-profile', BackEnd: 'dev', UserName: 'alice', Password: 'test' };
    store.Add(profile);
    store.SetActiveSession(profile);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: 'New connection' }));
    await user.click(await screen.findByRole('button', { name: 'Open test workspace' }));
    expect(await screen.findByText('Opened test workspace')).toBeInTheDocument();
    expect(randomUUID).not.toHaveBeenCalled();
  } finally {
    randomUUID.mockRestore();
  }
});

test('closes shortcut help using the header close icon', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Shortcuts', exact: true }));
  expect(
    screen.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true }),
  ).toBeInTheDocument();
  const close = screen.getByRole('button', { name: 'Close help', exact: true });
  expect(close.querySelector('svg')).not.toBeNull();
  await user.click(close);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('renders an actionable empty connection screen', async () => {
  render(<App />);
  expect(await screen.findByText('ETCD Adminer')).toBeInTheDocument();
  expect(screen.queryByRole('tablist', { name: 'Connection workspaces' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Connections', exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'ETCD Adminer — Connections' }).querySelector('img'),
  ).toHaveAttribute('src', '/images/logo.svg');
  expect(await screen.findByRole('heading', { name: 'No saved connections' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'New connection' })).toBeInTheDocument();
});

test('returns to Connections when clicking the application name from a connection subpage', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('link', { name: 'New connection' }));
  await screen.findByTestId('primary-color');
  await user.click(screen.getByRole('button', { name: 'ETCD Adminer — Connections' }));
  expect(
    await screen.findByRole('heading', { name: 'Connections', exact: true }),
  ).toBeInTheDocument();
  expect(screen.queryByTestId('primary-color')).not.toBeInTheDocument();
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
  await userEvent.click(await screen.findByRole('link', { name: 'New connection' }));
  expect(await screen.findByTestId('primary-color')).toHaveTextContent(primary);
});

test('restores a remembered workspace directly at its browser URL without a password prompt', async () => {
  const info = {
    id: 'remembered-reference',
    profile: 'Remembered',
    backend: 'prod',
    user: 'alice',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  localStorage.setItem(
    'sessions',
    JSON.stringify({
      Remembered: {
        Name: 'Remembered',
        BackEnd: 'prod',
        UserName: 'alice',
        SessionID: info.id,
        isActive: true,
      },
    }),
  );
  getSessions.mockResolvedValue({ connections: [info] });
  window.history.replaceState(null, '', '/workspaces/Remembered/metrics');
  render(<App />);
  expect(await screen.findByText('Opened test workspace')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(window.location.pathname).toBe('/workspaces/Remembered/metrics');
  expect(new SessionStore().Get('Remembered')).not.toHaveProperty('Password');
});

test('keeps the target URL and requests reauthentication for a revoked remembered login', async () => {
  localStorage.setItem(
    'sessions',
    JSON.stringify({
      Remembered: {
        Name: 'Remembered',
        BackEnd: 'prod',
        UserName: 'alice',
        SessionID: 'revoked',
        isActive: true,
      },
    }),
  );
  window.history.replaceState(null, '', '/workspaces/Remembered/keys?view=list');
  render(<App />);
  expect(
    await screen.findByRole('dialog', { name: 'Authenticate Remembered' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toHaveValue('');
  expect(window.location.pathname + window.location.search).toBe(
    '/workspaces/Remembered/keys?view=list',
  );
});
