import { encodeKey } from './transfer';

export const COPY_MAX_KEYS = 1000;
export const COPY_MAX_BYTES = 16 * 1024 * 1024;

export function folderPrefix(path) {
  return path.endsWith('/') ? path : `${path}/`;
}

export function copyDestinationError(source, destination) {
  if (!destination.trim()) return 'Enter a destination folder path.';
  const from = folderPrefix(source);
  const to = folderPrefix(destination);
  if (!source || from === '/' || to === '/')
    return 'Choose a non-root source and destination folder.';
  if (from.startsWith(to) || to.startsWith(from))
    return 'Source and destination must be different, non-overlapping prefixes.';
  if (new TextEncoder().encode(to).length > 8192)
    return 'Destination exceeds the 8192-byte key limit.';
  return '';
}

// Replace bytes only in the key prefix. Values and arbitrary binary suffixes are never decoded/re-encoded as text.
export function remapFolderRecords(records, source, destination) {
  const error = copyDestinationError(source, destination);
  if (error) throw new Error(error);
  const from = atob(encodeKey(folderPrefix(source)));
  const to = atob(encodeKey(folderPrefix(destination)));
  return records.map((record) => {
    const key = atob(record.keyBase64);
    if (!key.startsWith(from))
      throw new Error('Export returned a key outside the source folder. Nothing was copied.');
    const mapped = to + key.slice(from.length);
    if (mapped.length > 8192)
      throw new Error('A destination key exceeds 8192 bytes. Nothing was copied.');
    return { keyBase64: btoa(mapped), valueBase64: record.valueBase64 };
  });
}

const batch = (records) => ({ version: 1, operation: 'import', policy: 'create', records });
const checkAbort = (signal) => {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
};

export async function previewFolderCopy(
  service,
  { source, destination, signal, onProgress = () => {} },
) {
  const error = copyDestinationError(source, destination);
  if (error) throw new Error(error);
  let cursor = '';
  let revision;
  let count = 0;
  let size = 0;
  let fetchedPages = 0;
  const pages = [];
  const seenCursors = new Set();
  do {
    checkAbort(signal);
    const page = await service.ExportPage({ prefix: folderPrefix(source), cursor }, signal);
    fetchedPages++;
    checkAbort(signal);
    if (revision && revision !== page.revision)
      throw new Error('Source snapshot changed. Preview again; nothing was copied.');
    revision = page.revision;
    count += page.records.length;
    size += new TextEncoder().encode(JSON.stringify(page.records)).length;
    if (count > COPY_MAX_KEYS || size > COPY_MAX_BYTES || fetchedPages > 100)
      throw new Error(
        'Folder copy supports up to 1,000 keys / 16 MiB in 100 export pages. Narrow the source or use etcd tooling. Nothing was copied.',
      );
    if (page.records.length) {
      const mapped = remapFolderRecords(page.records, source, destination);
      pages.push(mapped);
    }
    onProgress(`Read ${count} source keys at snapshot revision ${revision}.`);
    if (!page.hasMore) break;
    if (!page.nextCursor || seenCursors.has(page.nextCursor))
      throw new Error('Invalid export continuation. Preview again; nothing was copied.');
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (true);
  if (!count)
    throw new Error(
      'No readable persisted keys were found under this folder. Empty virtual folders cannot be copied.',
    );
  const prepared = [];
  let checked = 0;
  for (const records of pages) {
    checkAbort(signal);
    const result = await service.TransferBatch({ ...batch(records), dryRun: true }, signal);
    checkAbort(signal);
    if (result.existing)
      throw new Error(
        'Destination keys already exist. Choose another folder; existing values will not be overwritten. Nothing was copied.',
      );
    if (
      result.records.length !== records.length ||
      result.records.some(
        (record, index) =>
          record.expectedRevision !== '0' ||
          record.keyBase64 !== records[index].keyBase64 ||
          record.valueBase64 !== records[index].valueBase64,
      )
    )
      throw new Error('Destination preview did not match the requested copy. Nothing was copied.');
    prepared.push(result.records);
    checked += records.length;
    onProgress(`Checked ${checked} / ${count} destination keys. Nothing has been written.`);
  }
  return {
    source: folderPrefix(source),
    destination: folderPrefix(destination),
    revision,
    count,
    pages: prepared,
  };
}

export async function applyFolderCopy(service, preview, { signal, onProgress = () => {} }) {
  let confirmed = 0;
  for (const records of preview.pages) {
    checkAbort(signal);
    const result = await service.TransferBatch(
      { ...batch(records), dryRun: false, confirmation: `IMPORT ${records.length}` },
      signal,
    );
    checkAbort(signal);
    if (!result.applied)
      throw new Error(
        'The destination changed. No successful commit was confirmed for this batch.',
      );
    confirmed += records.length;
    onProgress(confirmed);
  }
  return confirmed;
}
