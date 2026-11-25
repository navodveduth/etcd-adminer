import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Cluster from './cluster';

vi.mock('../../data/service', () => ({
  default: class {
    GetClusterInfo = async () => ({
      clusterID: '9007199254740993',
      memberID: '99',
      raftTerm: '4',
      revision: '0',
      nodes: [
        {
          ID: '99',
          name: 'member-a',
          available: true,
          isLeader: 'leader',
          version: '3.6.7',
          dbSize: 1048576,
          dbSizeInUse: 524288,
          clientUrls: ['http://example:2379'],
          peerUrls: [],
        },
      ],
    });
  },
}));

it('uses readable sizes and exact IDs without claiming a membership revision is current', async () => {
  render(
    <MemoryRouter>
      <Cluster />
    </MemoryRouter>,
  );
  expect(await screen.findByText('1 / 1')).toBeInTheDocument();
  expect(screen.getByText('1.00 MiB')).toBeInTheDocument();
  expect(screen.getByText('9007199254740993')).toBeInTheDocument();
  expect(screen.queryByText('Revision:')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show details for member-a' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});
