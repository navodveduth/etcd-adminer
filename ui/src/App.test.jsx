import { render, screen } from '@testing-library/react';
import App from './App';
import { vi, test, expect } from 'vitest';

// Exercise the shell without coupling this smoke test to API availability.
vi.mock('./components/newConnection', () => ({ default: () => <div>New connection</div> }));

test('renders the application and redirects an empty profile store', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'ETCD Adminer' })).toBeInTheDocument();
  expect(screen.getByText('New connection')).toBeInTheDocument();
});
