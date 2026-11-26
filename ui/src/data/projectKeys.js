// Project folders are the third nonempty path segment. Ancestor namespaces stay
// on the immediate-child folder API; never turn expanding /system into a scan.
export function isProjectPrefix(prefix) {
  if (!prefix.endsWith('/')) return false;
  const parts = prefix.slice(prefix.startsWith('/') ? 1 : 0, -1).split('/');
  return parts.length === 3 && parts.every(Boolean);
}

// One automatic project load is bounded to ten 1,000-key metadata pages. A
// signed cursor pins the snapshot and permits explicit continuation if needed.
export async function loadProjectKeys(service, prefix, initial, signal, onProgress) {
  let page = initial ?? { items: [], nextCursor: null };
  let cursor = page.nextCursor;
  const seen = new Set(cursor ? [cursor] : []);
  for (let count = 0; count < 10; count++) {
    signal.throwIfAborted();
    const next = await service.GetKeyPage({ prefix, cursor, limit: 1000 }, signal);
    signal.throwIfAborted();
    if (page.revision && page.revision !== next.revision)
      throw new Error('Project snapshot changed. Refresh to retry.');
    if (
      next.items.length > 1000 ||
      (next.hasMore && (!next.nextCursor || seen.has(next.nextCursor)))
    )
      throw new Error('Invalid project continuation. Refresh to retry.');
    page = { ...next, items: [...page.items, ...next.items] };
    onProgress(page);
    if (!page.hasMore) return page;
    cursor = page.nextCursor;
    seen.add(cursor);
  }
  return page;
}
