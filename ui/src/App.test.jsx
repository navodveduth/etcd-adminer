import { render, screen } from '@testing-library/react';
import App from './App';
import { vi, test, expect, beforeEach } from 'vitest';

// Exercise the shell without coupling this smoke test to API availability.
vi.mock('./components/connections/newConnection', () => ({ default: () => <div>New connection</div> }));
const { getConfig } = vi.hoisted(() => ({ getConfig: vi.fn() }));
vi.mock('./data/service', () => ({ default: class { GetConfig = getConfig; } }));
beforeEach(() => { getConfig.mockReset(); getConfig.mockResolvedValue({ clusters: [], readOnly: false }); });

test('renders the application and redirects an empty profile store', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'ETCD Adminer' })).toBeInTheDocument();
  expect(await screen.findByText('New connection')).toBeInTheDocument();
});

test('keeps mutation controls disabled when instance settings cannot be loaded', async () => {
  getConfig.mockRejectedValue(new Error('network unavailable'));
  render(<App />);
  expect(await screen.findByText('Could not load instance settings. Mutating controls are disabled.')).toBeInTheDocument();
});
