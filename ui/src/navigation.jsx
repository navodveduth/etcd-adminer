import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

const eventName = 'adminer-location';
const storageKey = 'workspace-navigation-v1';
const allowed = new Set([
  '/keys',
  '/cluster',
  '/metrics',
  '/transfer',
  '/leases',
  '/watchers',
  '/users',
  '/users/new',
  '/roles',
]);
export function workspacePath(path) {
  try {
    const value = new URL(path, 'http://local');
    return path.startsWith('/') && !path.startsWith('//') && allowed.has(value.pathname)
      ? value.pathname + value.search + value.hash
      : '/keys';
  } catch {
    return '/keys';
  }
}
export function workspaceURL(name, path = '/keys') {
  return `/workspaces/${encodeURIComponent(name)}${workspacePath(path)}`;
}
export function parseLocation(path) {
  const match = path.match(/^\/workspaces\/([^/]+)(\/.*)?$/);
  if (match) {
    try {
      return {
        kind: 'workspace',
        profile: decodeURIComponent(match[1]),
        path: workspacePath(match[2] ?? '/keys'),
      };
    } catch {
      /* Invalid URL. */
    }
  }
  if (path.split(/[?#]/)[0] === '/about') return { kind: 'about' };
  return { kind: 'connection', path: path.startsWith('/connection/new') ? path : '/connection' };
}
const current = () => window.location.pathname + window.location.search + window.location.hash;
export function navigateBrowser(path, { replace = false } = {}) {
  if (path === current()) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new Event(eventName));
}
export function useBrowserLocation() {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const changed = () => setPath(current());
    window.addEventListener('popstate', changed);
    window.addEventListener('hashchange', changed);
    window.addEventListener(eventName, changed);
    return () => {
      window.removeEventListener('popstate', changed);
      window.removeEventListener('hashchange', changed);
      window.removeEventListener(eventName, changed);
    };
  }, []);
  return path;
}
export function readNavigation() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return {
      open: Array.isArray(value.open)
        ? value.open.filter((name) => typeof name === 'string').slice(0, 4)
        : [],
      paths: new Map(
        Array.isArray(value.paths)
          ? value.paths
              .filter(
                (entry) =>
                  Array.isArray(entry) &&
                  typeof entry[0] === 'string' &&
                  typeof entry[1] === 'string',
              )
              .map(([name, path]) => [name, workspacePath(path)])
              .slice(0, 32)
          : [],
      ),
      last: typeof value.last === 'string' ? value.last : '/connection',
    };
  } catch {
    return { open: [], paths: new Map(), last: '/connection' };
  }
}
export function saveNavigation(open, paths, last) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ open, paths: [...paths].slice(-32), last }));
  } catch {
    /* Navigation can remain memory-only. */
  }
}

// Preserve isolated routers/drafts while publishing the active router in the URL.
export function LocationBridge({ active = true, externalPath, onChange }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const navigationType = useNavigationType();
  const path = location.pathname + location.search + location.hash;
  const latest = useRef(path);
  latest.current = path;
  const pending = useRef(null);
  useEffect(() => {
    if (active && externalPath && externalPath !== latest.current) {
      pending.current = externalPath;
      navigateRef.current(externalPath, { replace: true });
    }
  }, [active, externalPath]);
  useEffect(() => {
    if (pending.current && pending.current !== path) return;
    const fromBrowser = Boolean(pending.current);
    pending.current = null;
    onChange?.(path, { active, fromBrowser, replace: navigationType === 'REPLACE' });
  }, [path, active, navigationType, onChange]);
  return null;
}
