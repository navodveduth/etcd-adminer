import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Metrics from './metrics';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../../data/service', () => ({
  default: class {
    BindActiveSession = () => this;
    GetMetrics = async () => ({
      sampledAt: new Date().toISOString(),
      source: 'maintenance',
      alarms: [],
      alarmError: 'Alarms unavailable',
      members: [
        {
          endpoint: 'healthy',
          available: true,
          id: '1',
          leader: '1',
          dbSize: 1024,
          dbInUse: 512,
          quota: null,
          term: '4',
          applyLag: '0',
        },
        { endpoint: 'offline', available: false, error: 'endpoint unavailable' },
      ],
    });
  },
}));
it('keeps partial samples visible and labels missing quota and alarms as unavailable', async () => {
  render(
    <MemoryRouter>
      <Metrics />
    </MemoryRouter>,
  );
  expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  expect(screen.getByText('endpoint unavailable')).toBeInTheDocument();
  expect(screen.getByText('Alarms unavailable')).toBeInTheDocument();
  expect(screen.getByText(/not inferred from a status snapshot/)).toBeInTheDocument();
});
