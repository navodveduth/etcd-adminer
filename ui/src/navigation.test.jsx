import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import {
  LocationBridge,
  parseLocation,
  readNavigation,
  saveNavigation,
  workspacePath,
  workspaceURL,
} from './navigation';

it('encodes profile names and accepts only known local feature paths', () => {
  const url = workspaceURL('team/日本語', '/keys?view=list&key=%2Fa');
  expect(parseLocation(url)).toEqual({
    kind: 'workspace',
    profile: 'team/日本語',
    path: '/keys?view=list&key=%2Fa',
  });
  for (const path of [
    'https://attacker.example',
    '//attacker.example/keys',
    '/unknown',
    '/api/v1/keys',
  ])
    expect(workspacePath(path)).toBe('/keys');
  expect(parseLocation('/about')).toEqual({ kind: 'about' });
  expect(parseLocation('/connection/new?edit=saved')).toEqual({
    kind: 'connection',
    path: '/connection/new?edit=saved',
  });
});

it('saves non-secret navigation metadata and tolerates malformed storage', () => {
  saveNavigation(
    ['saved'],
    new Map([['saved', '/keys?view=list']]),
    '/workspaces/saved/keys?view=list',
  );
  expect(readNavigation().paths.get('saved')).toBe('/keys?view=list');
  expect(readNavigation().open).toEqual(['saved']);
  localStorage.setItem('workspace-navigation-v1', 'bad-json');
  expect(readNavigation().open).toEqual([]);
});

function Probe() {
  const location = useLocation();
  return (
    <>
      <output>{location.pathname + location.search}</output>
      <Link to="/metrics">Metrics</Link>
    </>
  );
}
it('publishes internal navigation without bouncing back and accepts external Back/Forward locations', async () => {
  const changed = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={['/keys?view=list']}>
      <LocationBridge externalPath="/keys?view=list" onChange={changed} />
      <Probe />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('link', { name: 'Metrics' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('/metrics'));
  expect(changed).toHaveBeenLastCalledWith(
    '/metrics',
    expect.objectContaining({ fromBrowser: false }),
  );
  view.rerender(
    <MemoryRouter initialEntries={['/keys?view=list']}>
      <LocationBridge externalPath="/keys?prefix=%2Fa" onChange={changed} />
      <Probe />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('/keys?prefix=%2Fa'));
  expect(changed).toHaveBeenLastCalledWith(
    '/keys?prefix=%2Fa',
    expect.objectContaining({ fromBrowser: true }),
  );
});
