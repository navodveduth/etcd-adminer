import { expect, it } from 'vitest';
import { readSSE } from './sse';

function stream(text, size = 1) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += size)
        controller.enqueue(bytes.slice(offset, offset + size));
      controller.close();
    },
  });
}

it('parses split UTF-8 and CRLF frames without losing revision precision', async () => {
  const frames = [];
  await readSSE(
    stream(
      'event: changes\r\nid: 9007199254740993\r\ndata: {"key":"日本語","revision":"9007199254740993"}\r\n\r\n',
    ),
    (frame) => frames.push(frame),
  );
  expect(frames).toEqual([
    {
      event: 'changes',
      id: '9007199254740993',
      data: { key: '日本語', revision: '9007199254740993' },
    },
  ]);
});

it('never acknowledges a truncated event', async () => {
  const frames = [];
  await expect(
    readSSE(stream('event: changes\nid: 42\ndata: {"key":"unfinished'), (frame) =>
      frames.push(frame),
    ),
  ).rejects.toThrow('during an event');
  expect(frames).toEqual([]);
});

it('bounds pending frames and supports cancellation', async () => {
  await expect(readSSE(stream('x'.repeat(4 * 1024 * 1024 + 1), 65536), () => {})).rejects.toThrow(
    'size budget',
  );
  const controller = new AbortController();
  controller.abort();
  await expect(readSSE(stream(''), () => {}, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
