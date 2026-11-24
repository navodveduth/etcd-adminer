import { describe, it, expect, vi } from 'vitest';
import { Session, SessionStore } from './session';

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
});
