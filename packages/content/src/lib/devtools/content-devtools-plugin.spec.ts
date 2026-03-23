import { describe, it, expect } from 'vitest';
import type { IndexHtmlTransformContext, ResolvedConfig } from 'vite';
import { contentDevToolsPlugin } from './content-devtools-plugin';

describe('contentDevToolsPlugin', () => {
  it('returns a Vite plugin with the correct name', () => {
    const plugin = contentDevToolsPlugin();
    expect(plugin.name).toBe('analog-content-devtools');
  });

  it('applies only to serve mode', () => {
    const plugin = contentDevToolsPlugin();
    expect(plugin.apply).toBe('serve');
  });

  it('injects devtools client into HTML in serve mode', async () => {
    const plugin = contentDevToolsPlugin();
    const configResolved = plugin.configResolved as (
      config: ResolvedConfig,
    ) => void;
    configResolved({ command: 'serve' } as ResolvedConfig);

    const hook = plugin.transformIndexHtml as {
      handler: (
        html: string,
        ctx: IndexHtmlTransformContext,
      ) => Promise<string>;
    };
    const inputHtml =
      '<html><head></head><body><div id="app"></div></body></html>';
    const result = await hook.handler(
      inputHtml,
      {} as IndexHtmlTransformContext,
    );

    expect(result).toContain('<style>');
    expect(result).toContain('<script type="module">');
    expect(result).toContain('analog-content-devtools');
    expect(result).toContain('</body>');
  });
});
