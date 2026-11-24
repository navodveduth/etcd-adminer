import { describe, it, expect } from 'vitest';
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
});
