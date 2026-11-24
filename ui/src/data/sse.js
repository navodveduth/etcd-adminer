// Incremental SSE parsing: preserve UTF-8 and frames across arbitrary network
// chunks. Never acknowledge a partially received revision.
export async function readSSE(body, onFrame, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const abort = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      pending = (pending + decoder.decode(value, { stream: true })).replaceAll('\r\n', '\n');
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const raw = pending.slice(0, boundary);
        if (raw.length > 4 * 1024 * 1024)
          throw new Error('Stream frame exceeded its size budget. Narrow the prefix.');
        pending = pending.slice(boundary + 2);
        const frame = { event: 'message', id: '', data: [] };
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) frame.event = line.slice(6).trim();
          else if (line.startsWith('id:')) frame.id = line.slice(3).trim();
          else if (line.startsWith('data:')) frame.data.push(line.slice(5).trimStart());
        }
        if (frame.data.length) onFrame({ ...frame, data: JSON.parse(frame.data.join('\n')) });
      }
      if (pending.length > 4 * 1024 * 1024)
        throw new Error('Stream frame exceeded its size budget. Narrow the prefix.');
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (pending.trim())
      throw new Error('Stream ended during an event. Reconnect from the last complete revision.');
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
