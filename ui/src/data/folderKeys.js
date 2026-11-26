// Collect keys-only summaries using signed, snapshot-bound server cursors. Never
// turn folder browsing into an unbounded range request or fetch key values.
export const FOLDER_PAGE_SIZE = 1000;
export const FOLDER_BATCH_LIMIT = 10000;

export async function loadFolderKeys(service, prefix, initial, signal, onProgress) {
  let page = initial ?? { items: [], nextCursor: null };
  let cursor = page.nextCursor;
  const seen = new Set();
  if (cursor) seen.add(cursor);
  let requests = 0;
  do {
    signal.throwIfAborted();
    requests++;
    const next = await service.GetKeyPage({ prefix, cursor, limit: FOLDER_PAGE_SIZE }, signal);
    signal.throwIfAborted();
    if (page.revision && page.revision !== next.revision)
      throw new Error('Folder snapshot changed. Restart / refresh to load a fresh tree.');
    if (next.hasMore && (!next.nextCursor || seen.has(next.nextCursor)))
      throw new Error('Folder pagination did not advance. Restart / refresh to retry.');
    if (next.items.length > FOLDER_PAGE_SIZE)
      throw new Error('Folder page exceeded its safety limit. Use a narrower prefix.');
    page = { ...next, items: [...page.items, ...next.items] };
    onProgress(page);
    cursor = next.nextCursor;
    seen.add(cursor);
  } while (page.hasMore && requests < FOLDER_BATCH_LIMIT / FOLDER_PAGE_SIZE);
  return page;
}
