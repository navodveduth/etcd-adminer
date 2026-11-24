import { expect, it } from 'vitest';
import { patchKeyPage } from './liveKeys';
it('patches complete pages and flags partial membership instead of inventing completeness', () => {
    const page = { revision: '42', items: [{ key: '/a', keyEncoding: 'utf8', modRevision: '42' }], hasMore: true };
    const partial = patchKeyPage(page, [{ type: 'PUT', key: '/b', keyEncoding: 'utf8', revision: '43' }], true);
    expect(partial.stale).toBe(true);
    expect(partial.page.items).toEqual(page.items);
    const complete = patchKeyPage({ ...page, hasMore: false }, [{ type: 'PUT', key: '/b', keyEncoding: 'utf8', revision: '43' }, { type: 'DELETE', key: '/a', keyEncoding: 'utf8', revision: '44' }], false);
    expect(complete.stale).toBe(false);
    expect(complete.page.items).toEqual([{ key: '/b', keyEncoding: 'utf8', modRevision: '43' }]);
    expect(page.items[0].key).toBe('/a');
});
