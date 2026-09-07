import { describe, expect, it } from 'vitest';
import { createAngularMemoryPlugin } from './angular-memory-plugin';
import type { AngularMemoryOutputFiles } from '../utils';

describe('Angular in-memory test output', () => {
  it.each(['js', 'mjs'])(
    'loads emitted .%s test code and its matching source map',
    async (extension) => {
      const key = `spec-src-example.spec.${extension}`;
      const sourceMap = JSON.stringify({
        version: 3,
        sources: ['example.spec.ts'],
        names: [],
        mappings: '',
      });
      const outputFiles: AngularMemoryOutputFiles = new Map([
        [
          key,
          {
            contents: Buffer.from('export const compiled = true;'),
            hash: 'code',
            servable: true,
          },
        ],
        [
          `${key}.map`,
          { contents: Buffer.from(sourceMap), hash: 'map', servable: true },
        ],
      ]);
      const plugin = await createAngularMemoryPlugin({
        workspaceRoot: process.cwd(),
        angularVersion: 22,
        outputFiles,
      });
      plugin.config({ root: process.cwd() });
      expect(plugin.load(`${process.cwd()}/src/example.spec.ts`)).toEqual({
        code: 'export const compiled = true;',
        map: sourceMap,
      });
    },
  );
});
