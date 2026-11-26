import { describe, it, expect, vi } from 'vitest';
import { Session, SessionStore, recordAuthentication } from './session';

describe('SessionStore', () => {
  it('tolerates empty, corrupt, and invalid saved profiles', () => {
    for (const value of ['', '{bad', 'null', '[]', '{"bad":{}}']) {
      localStorage.setItem('sessions', value);
      const store = new SessionStore();
      expect(store.GetAll()).toEqual({});
      expect(store.GetActiveSession()).toBeUndefined();
      expect(store.Get('missing')).toBeUndefined();
    }
  });

  it('creates, selects, and removes profiles, including special names', () => {
    const store = new SessionStore();
    const first = new Session('__proto__', 'one', [], 'alice', 'secret');
    const second = new Session('second', 'two', [], 'bob', 'secret');
    store.Add(first);
    store.Add(second);
    expect(store.SetActiveSession(first)).toBe(true);
    expect(store.GetActiveSession().Name).toBe('__proto__');
    store.SetActiveSession(second);
    expect(store.Get('__proto__').isActive).toBe(false);
    store.Delete(second);
    expect(store.GetActiveSession()).toBeUndefined();
    expect(store.SetActiveSession(second)).toBe(false);
  });

  it('persists metadata only and clears credentials on disconnect', () => {
    const store = new SessionStore();
    const profile = new Session('private', 'backend', [], 'alice', 'never-persist-this');
    store.Add(profile);
    store.SetActiveSession(profile);
    expect(localStorage.getItem('sessions')).not.toContain('never-persist-this');
    expect(localStorage.getItem('sessions')).not.toContain('Password');
    expect(store.GetActiveSession().Password).toBe('never-persist-this');
    expect(store.GetAll().private).not.toHaveProperty('Password');
    store.DisconnectAll();
    expect(store.GetActiveSession()).toBeUndefined();
    expect(store.Get('private')).not.toHaveProperty('Password');
  });

  it('scrubs legacy stored passwords and requires reauthentication', () => {
    localStorage.setItem(
      'sessions',
      JSON.stringify({
        legacy: {
          Name: 'legacy',
          BackEnd: 'backend',
          UserName: 'alice',
          Password: 'legacy-secret',
          isActive: true,
        },
      }),
    );
    const store = new SessionStore();
    expect(store.GetActiveSession()).toBeUndefined();
    expect(store.GetAll().legacy.isActive).toBe(false);
    expect(localStorage.getItem('sessions')).not.toContain('legacy-secret');
    expect(store.SetActiveSession({ Name: 'legacy' })).toBe(false);
  });

  it('requires reauthentication after a fresh module/tab lifecycle', async () => {
    const store = new SessionStore();
    const profile = new Session('reload', 'backend', [], 'alice', 'ephemeral');
    store.Add(profile);
    store.SetActiveSession(profile);
    vi.resetModules();
    const { SessionStore: ReloadedStore } = await import('./session');
    expect(new ReloadedStore().GetActiveSession()).toBeUndefined();
  });

  it('keeps remembered passwords out of memory profiles/storage and reconfirms references after reload', async () => {
    const store = new SessionStore();
    const info = {
      id: 'public-reference',
      profile: 'remembered',
      backend: 'prod',
      user: 'alice',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
    recordAuthentication('remembered', info);
    store.Add(new Session('remembered', 'prod', [], 'alice', 'never-store-me'));
    store.SetActiveSession({ Name: 'remembered' });
    expect(store.GetActiveSession().Authenticated).toBe(true);
    expect(store.GetActiveSession()).not.toHaveProperty('Password');
    expect(localStorage.getItem('sessions')).not.toContain('never-store-me');
    expect(localStorage.getItem('sessions')).not.toContain('Password');
    vi.resetModules();
    const { SessionStore: ReloadedStore } = await import('./session');
    const reloaded = new ReloadedStore();
    expect(reloaded.GetActiveSession()).toBeUndefined();
    reloaded.RestoreRemembered([info]);
    expect(reloaded.GetActiveSession().SessionID).toBe(info.id);
    expect(reloaded.GetActiveSession()).not.toHaveProperty('Password');
    reloaded.RestoreRemembered([]);
    expect(reloaded.GetActiveSession()).toBeUndefined();
  });

  it('rejects forged metadata, other identities and expired remembered references', () => {
    const store = new SessionStore();
    const info = {
      id: 'reference',
      profile: 'saved',
      backend: 'prod',
      user: 'alice',
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };
    localStorage.setItem(
      'sessions',
      JSON.stringify({
        saved: {
          Name: 'saved',
          BackEnd: 'prod',
          UserName: 'root',
          SessionID: info.id,
          isActive: true,
        },
      }),
    );
    store.RestoreRemembered([info]);
    expect(store.Get('saved').Authenticated).toBe(false);
    localStorage.setItem(
      'sessions',
      JSON.stringify({
        saved: {
          Name: 'saved',
          BackEnd: 'prod',
          UserName: 'alice',
          SessionID: info.id,
          isActive: true,
        },
      }),
    );
    expect(store.Get('saved').Authenticated).toBe(true);
    store.RestoreRemembered([{ ...info, expiresAt: new Date(Date.now() - 1).toISOString() }]);
    expect(store.GetActiveSession()).toBeUndefined();
  });
});
