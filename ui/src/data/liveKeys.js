const compareBytes = (left, right) => {
    const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
};

// Never pretend a partial cached page has complete query membership. Existing
// records can be patched; insertion/removal at page boundaries needs a restart.
export function patchKeyPage(page, events, partial) {
    let items = [...page.items];
    let stale = false;
    for (const event of events) {
        const index = items.findIndex((item) => item.key === event.key && item.keyEncoding === event.keyEncoding);
        if (event.type === 'DELETE') {
            if (index >= 0) { items.splice(index, 1); if (partial) stale = true; }
        } else if (index >= 0) items[index] = { ...items[index], modRevision: event.revision };
        else if (!partial && items.length < 100) items.push({ key: event.key, keyEncoding: event.keyEncoding, modRevision: event.revision });
        else stale = true;
    }
    items.sort((a, b) => a.keyEncoding === 'utf8' && b.keyEncoding === 'utf8' ? compareBytes(a.key, b.key) : 0);
    return { page: { ...page, items }, stale };
}

export function reconnectDelay(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
    });
}
