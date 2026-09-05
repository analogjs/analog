import { SourceMap } from 'node:module';
import { describe, expect, it } from 'vitest';

import { fastCompilePlugin } from './fast-compile-plugin';

describe('fastCompilePlugin source maps', () => {
  it('maps stripped TypeScript back to its original position', async () => {
    const plugin = fastCompilePlugin({
      tsconfigGetter: () => 'tsconfig.json',
      workspaceRoot: '/workspace',
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      supportedBrowsers: [],
      isTest: false,
      isAstroIntegration: false,
    });
    const transform = plugin.transform as any;
    const handler = transform.handler ?? transform;
    const code = [
      `import { Component } from '@angular/core';`,
      `@Component({ selector: 'x', template: '' })`,
      `export class XComponent {`,
      `  value: string = 'source-map-target';`,
      `}`,
    ].join('\n');

    const result = await handler.call(
      { addWatchFile: () => undefined },
      code,
      '/src/app/x.component.ts',
    );
    const generatedOffset = result.code.indexOf('source-map-target');
    const generatedBeforeTarget = result.code.slice(0, generatedOffset);
    const generatedLine = generatedBeforeTarget.split('\n').length - 1;
    const generatedColumn =
      generatedOffset - generatedBeforeTarget.lastIndexOf('\n') - 1;
    const entry = new SourceMap(result.map).findEntry(
      generatedLine,
      generatedColumn,
    );

    expect(entry.originalSource).toBe('x.component.ts');
    expect(entry.originalLine).toBe(3);
    expect(entry.originalColumn).toBe(
      code.split('\n')[3].indexOf("'source-map-target'"),
    );
  });
});
