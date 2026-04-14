import { beforeEach, describe, expect, it, vi } from 'vitest';

const createHighlighterMock = vi.fn(async () => ({
  codeToHtml: vi.fn((_code: string, options: { lang: string }) => {
    return `<pre class="shiki" data-lang="${options.lang}"></pre>`;
  }),
}));

vi.mock('shiki', () => ({
  createHighlighter: createHighlighterMock,
}));

vi.mock('marked-shiki', () => ({
  default: (options: unknown) => options,
}));

let getShikiHighlighter: typeof import('./index.js').getShikiHighlighter;

beforeEach(async () => {
  vi.resetModules();
  createHighlighterMock.mockClear();
  ({ getShikiHighlighter } = await import('./index.js'));
});

describe('getShikiHighlighter', () => {
  it('does not load skipped languages into shiki and preserves the mermaid render path', async () => {
    const highlighter = getShikiHighlighter({
      highlighter: {
        additionalLangs: ['mermaid'],
        skipLangs: ['mermaid'],
      },
    });

    expect(createHighlighterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        langs: expect.not.arrayContaining(['mermaid']),
      }),
    );

    const extension = highlighter.getHighlightExtension() as {
      highlight: (
        code: string,
        lang: string,
        props: string[],
      ) => Promise<string>;
    };

    await expect(extension.highlight('graph TD;', 'mermaid', [])).resolves.toBe(
      '<pre class="mermaid">graph TD;</pre>',
    );
  });

  it('returns plain fenced code blocks for skipped non-mermaid languages', async () => {
    const highlighter = getShikiHighlighter({
      highlighter: {
        additionalLangs: ['yaml'],
        skipLangs: ['yaml'],
      },
    });

    const extension = highlighter.getHighlightExtension() as {
      highlight: (
        code: string,
        lang: string,
        props: string[],
      ) => Promise<string>;
    };

    await expect(extension.highlight('name: analog', 'yaml', [])).resolves.toBe(
      '<pre class="language-yaml"><code class="language-yaml">name: analog</code></pre>',
    );
  });

  it('escapes HTML when rendering skipped languages', async () => {
    const highlighter = getShikiHighlighter({
      highlighter: {
        additionalLangs: ['yaml'],
        skipLangs: ['yaml'],
      },
    });

    const extension = highlighter.getHighlightExtension() as {
      highlight: (
        code: string,
        lang: string,
        props: string[],
      ) => Promise<string>;
    };

    await expect(
      extension.highlight(`<div class="x">Tom & 'Jerry'</div>`, 'yaml', []),
    ).resolves.toBe(
      '<pre class="language-yaml"><code class="language-yaml">&lt;div class=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/div&gt;</code></pre>',
    );
  });

  it('still returns mermaid blocks when loadMermaid handling is enabled and the language is not skipped', async () => {
    const highlighter = getShikiHighlighter({
      highlighter: {
        additionalLangs: ['mermaid'],
      },
    });

    const extension = highlighter.getHighlightExtension() as {
      highlight: (
        code: string,
        lang: string,
        props: string[],
      ) => Promise<string>;
    };

    await expect(extension.highlight('graph TD;', 'mermaid', [])).resolves.toBe(
      '<pre class="mermaid">graph TD;</pre>',
    );
  });
});
