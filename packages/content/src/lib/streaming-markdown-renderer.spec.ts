import { describe, it, expect } from 'vitest';
import { streamMarkdown } from './streaming-markdown-renderer';

function createChunkStream(chunks: string[]): ReadableStream<string> {
  let index = 0;
  return new ReadableStream<string>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

function createErrorStream(
  chunks: string[],
  errorAfter: number,
): ReadableStream<string> {
  let index = 0;
  return new ReadableStream<string>({
    pull(controller) {
      if (index < errorAfter && index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.error(new Error('Stream interrupted'));
      }
    },
  });
}

async function collectStream(
  stream: ReadableStream<string>,
): Promise<string[]> {
  const chunks: string[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe('streamMarkdown', () => {
  // ── Core rendering ───────────────────────────────────────────────

  it('renders a complete markdown stream', async () => {
    const input = createChunkStream(['# Hello\n\n', 'World']);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    expect(chunks.length).toBeGreaterThan(0);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk).toContain('<h1>');
    expect(lastChunk).toContain('Hello');
  });

  it('handles single-chunk input', async () => {
    const input = createChunkStream(['# Title\n\nParagraph']);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    const combined = chunks.join('');
    expect(combined).toContain('<h1>');
    expect(combined).toContain('Paragraph');
  });

  it('handles empty stream', async () => {
    const input = createChunkStream([]);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    expect(chunks).toEqual([]);
  });

  it('accumulates buffer across chunks', async () => {
    const input = createChunkStream(['# He', 'llo']);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk).toContain('Hello');
  });

  it('works without heal option (raw rendering)', async () => {
    const input = createChunkStream(['**bold text**']);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    const combined = chunks.join('');
    expect(combined).toContain('<strong>bold text</strong>');
  });

  // ── GFM in streaming ────────────────────────────────────────────

  it('renders GFM tables in streaming mode', async () => {
    const input = createChunkStream([
      '| A | B |\n| --- | --- |\n',
      '| 1 | 2 |\n',
    ]);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk).toContain('<table>');
  });

  it('renders GFM task lists in streaming mode', async () => {
    const input = createChunkStream(['- [x] Done\n', '- [ ] Todo\n']);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk).toContain('type="checkbox"');
  });

  // ── Heal mode ────────────────────────────────────────────────────

  it('heals unclosed bold in intermediate chunks', async () => {
    const input = createChunkStream(['**bold', ' text**\n\n', '`code']);
    const output = await streamMarkdown(input, { heal: true });
    const chunks = await collectStream(output);

    for (const chunk of chunks) {
      expect(chunk).not.toBe('');
    }
    expect(chunks[0]).toContain('<strong>');
  });

  it('heals unclosed code block', async () => {
    const input = createChunkStream(['```\ncode without', ' closing']);
    const output = await streamMarkdown(input, { heal: true });
    const chunks = await collectStream(output);

    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk).toContain('<code');
  });

  it('heals unclosed italic', async () => {
    const input = createChunkStream(['*italic without closing']);
    const output = await streamMarkdown(input, { heal: true });
    const chunks = await collectStream(output);

    expect(chunks[0]).toContain('<em>');
    expect(chunks[0]).toContain('</em>');
  });

  // ── Error handling ───────────────────────────────────────────────

  it('propagates input stream errors to output stream', async () => {
    const input = createErrorStream(['# Partial', ' content'], 1);
    const output = await streamMarkdown(input);
    const reader = output.getReader();

    // First chunk should succeed
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(first.value).toContain('Partial');

    // Second read should error
    await expect(reader.read()).rejects.toThrow('Stream interrupted');
  });

  it('propagates errors when stream fails immediately', async () => {
    const input = createErrorStream([], 0);
    const output = await streamMarkdown(input);
    const reader = output.getReader();

    await expect(reader.read()).rejects.toThrow('Stream interrupted');
  });

  // ── Large content ────────────────────────────────────────────────

  it('handles many small chunks', async () => {
    const words = Array.from({ length: 50 }, (_, i) => `word${i} `);
    const input = createChunkStream(words);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    expect(chunks.length).toBeGreaterThan(0);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk).toContain('word49');
  });

  it('renders frontmatter + content in streaming mode', async () => {
    const input = createChunkStream(['---\ntitle: Test\n---\n\n', '# Hello']);
    const output = await streamMarkdown(input);
    const chunks = await collectStream(output);

    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk).toContain('Hello');
    expect(lastChunk).not.toContain('title: Test');
  });
});
