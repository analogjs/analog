import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TsrxTypeGenerator } from './types.js';

// Fixtures live inside the package so `@angular/core` resolves from them.
let root: string;

function write(files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
}

const read = (name: string) => readFileSync(join(root, name), 'utf8');
const generated = (name: string) => `node_modules/.analog/tsrx-types/${name}`;

/** Type-checks `files` the way an app would, with the generated declarations. */
function typeErrors(): string[] {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(root, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => undefined,
    },
  )!;
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

beforeEach(() => {
  root = mkdtempSync(join(import.meta.dirname, '.types-spec-'));
  write({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'es2022',
        module: 'preserve',
        moduleResolution: 'bundler',
        experimentalDecorators: false,
        skipLibCheck: true,
        types: [],
        allowArbitraryExtensions: true,
        rootDirs: ['.', 'node_modules/.analog/tsrx-types'],
      },
      include: ['src/**/*.ts'],
    }),
    'src/models.ts':
      'export interface Product { name: string; price: number }\n',
    'src/price.tsrx': `import { input } from '@angular/core';
import type { Product } from './models';

export const PriceMeta = { selector: 'app-price' };

export function Price() @{
  const amount = input(0);
  const product = input.required<Product>();
  const secret = 'internal';
  <span>{secret}{amount()}{product().name}</span>
}
`,
    'src/list.tsrx': `import { Price } from './price.tsrx';

function Hidden() @{ <p /> }

export default function List() @{
  <Price amount={1} />
}
`,
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('TsrxTypeGenerator', () => {
  it('writes declarations with inferred types, mirroring the sources', async () => {
    const result = await new TsrxTypeGenerator({
      tsconfig: join(root, 'tsconfig.json'),
    }).generate();

    expect(result.diagnostics).toEqual([]);
    expect(result.written.map((f) => f.slice(root.length + 1)).sort()).toEqual([
      generated('src/list.d.tsrx.ts'),
      generated('src/price.d.tsrx.ts'),
    ]);
    const price = read(generated('src/price.d.tsrx.ts'));
    expect(price).toContain(`import type { Product } from './models';`);
    expect(price).toContain('export declare const PriceMeta');
    expect(price).toContain(
      'readonly amount: import("@angular/core").InputSignal<number>;',
    );
    expect(price).toContain(
      'readonly product: import("@angular/core").InputSignal<Product>;',
    );
    // Lowering internals are stripped.
    expect(price).not.toContain('$fc');
    expect(price).not.toContain('secret');

    const list = read(generated('src/list.d.tsrx.ts'));
    expect(list).toContain('export default class List');
    expect(list).not.toContain('Hidden');
  });

  it('lets TypeScript type-check imports of .tsrx modules', async () => {
    write({
      'src/main.ts': `import { Price } from './price.tsrx';
import List from './list.tsrx';
const amount: number = new Price().amount();
const name: number = new Price().product().name;
export { amount, name, List };
`,
    });
    expect(typeErrors()).toEqual([
      expect.stringContaining(`Cannot find module './price.tsrx'`),
      expect.stringContaining(`Cannot find module './list.tsrx'`),
    ]);

    await new TsrxTypeGenerator({
      tsconfig: join(root, 'tsconfig.json'),
    }).generate();
    expect(typeErrors()).toEqual([
      `Type 'string' is not assignable to type 'number'.`,
    ]);
  });

  it('only rewrites changed declarations and removes stale ones', async () => {
    const generator = new TsrxTypeGenerator({
      tsconfig: join(root, 'tsconfig.json'),
    });
    await generator.generate();

    expect((await generator.generate()).written).toEqual([]);

    rmSync(join(root, 'src/list.tsrx'));
    const result = await generator.generate();
    expect(result.written).toEqual([]);
    expect(result.removed).toEqual([
      join(root, generated('src/list.d.tsrx.ts')),
    ]);
    expect(existsSync(join(root, generated('src/list.d.tsrx.ts')))).toBe(false);
  });

  it('reports lowering errors at their .tsrx position and keeps the previous declarations', async () => {
    const generator = new TsrxTypeGenerator({
      tsconfig: join(root, 'tsconfig.json'),
    });
    await generator.generate();
    const before = read(generated('src/list.d.tsrx.ts'));

    write({ 'src/list.tsrx': `export function List() @{\n  <div>\n}\n` });
    const result = await generator.generate();

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        fileName: join(root, 'src/list.tsrx'),
        line: expect.any(Number),
      }),
    ]);
    expect(result.removed).toEqual([]);
    expect(read(generated('src/list.d.tsrx.ts'))).toBe(before);
  });

  it('writes to a custom outDir', async () => {
    await new TsrxTypeGenerator({
      tsconfig: join(root, 'tsconfig.json'),
      outDir: '.types',
    }).generate();
    expect(existsSync(join(root, '.types/src/price.d.tsrx.ts'))).toBe(true);
  });

  it('respects tsconfig include and exclude (including via extends)', async () => {
    write({
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'es2022',
          module: 'preserve',
          moduleResolution: 'bundler',
          experimentalDecorators: false,
          skipLibCheck: true,
          types: [],
          allowArbitraryExtensions: true,
          rootDirs: ['.', 'node_modules/.analog/tsrx-types'],
        },
        include: ['src/**/*.ts'],
        exclude: ['**/*.spec.ts', 'src/fixtures/**', 'src/ignored.tsrx'],
      }),
      'tsconfig.json': JSON.stringify({
        extends: './tsconfig.base.json',
      }),
      // Invalid syntax outside `include` proves it is never lowered.
      'outside/broken.tsrx': 'export function Broken() @{ <div> }\n',
      'src/fixtures/demo.tsrx': 'export function Demo() @{ <div /> }\n',
      'src/price.spec.tsrx': 'export function PriceSpec() @{ <div /> }\n',
      'src/ignored.tsrx': 'export function Ignored() @{ <div /> }\n',
    });

    const generator = new TsrxTypeGenerator({
      tsconfig: join(root, 'tsconfig.json'),
    });
    expect(generator.findTsrxFiles()).toEqual([
      join(root, 'src/list.tsrx'),
      join(root, 'src/price.tsrx'),
    ]);

    const result = await generator.generate();
    expect(result.diagnostics).toEqual([]);
    expect(result.written.map((f) => f.slice(root.length + 1)).sort()).toEqual([
      generated('src/list.d.tsrx.ts'),
      generated('src/price.d.tsrx.ts'),
    ]);
    expect(existsSync(join(root, generated('outside/broken.d.tsrx.ts')))).toBe(
      false,
    );
    expect(
      existsSync(join(root, generated('src/fixtures/demo.d.tsrx.ts'))),
    ).toBe(false);
    expect(existsSync(join(root, generated('src/price.spec.d.tsrx.ts')))).toBe(
      false,
    );
    expect(existsSync(join(root, generated('src/ignored.d.tsrx.ts')))).toBe(
      false,
    );
  });

  it('resolves .tsrx imports through tsconfig paths and baseUrl aliases', async () => {
    rmSync(join(root, 'src/price.tsrx'));
    rmSync(join(root, 'src/list.tsrx'));
    write({
      'package.json': JSON.stringify({ type: 'module' }),
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          paths: {
            '@components/*': [
              './src/components/*',
              './node_modules/.analog/tsrx-types/src/components/*',
            ],
          },
        },
      }),
      'tsconfig.json': JSON.stringify({
        extends: './tsconfig.base.json',
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'es2022',
          module: 'nodenext',
          moduleResolution: 'nodenext',
          baseUrl: '.',
          ignoreDeprecations: '6.0',
          experimentalDecorators: false,
          skipLibCheck: true,
          types: [],
          allowArbitraryExtensions: true,
          rootDirs: ['.', 'node_modules/.analog/tsrx-types'],
        },
        include: ['src/**/*.ts'],
      }),
      // Stale declaration on disk proves generation resolves freshly lowered code.
      [generated('src/components/price.d.tsrx.ts')]:
        'export declare class Price { readonly stale: string; }\n',
      'src/components/price.tsrx': `import { input } from '@angular/core';

export function Price() @{
  const amount = input(0);
  <span>{amount()}</span>
}
`,
      'src/list.tsrx': `import { Price } from '@components/price.tsrx';

export function createPrice() {
  return new Price();
}

export default function List() @{
  <Price amount={1} />
}
`,
      'src/base-url.tsrx': `import { Price } from 'src/components/price.tsrx';

export function createFromBaseUrl() {
  return new Price();
}

export function BaseUrlConsumer() @{
  <Price amount={2} />
}
`,
      'src/main.ts': `import { Price } from '@components/price.tsrx';
import { createPrice } from './list.tsrx';

const ok: number = createPrice().amount();
const bad: string = new Price().amount();
export { ok, bad };
`,
    });

    const result = await new TsrxTypeGenerator({
      tsconfig: join(root, 'tsconfig.json'),
    }).generate();

    expect(result.diagnostics).toEqual([]);
    const price = read(generated('src/components/price.d.tsrx.ts'));
    expect(price).toContain(
      'readonly amount: import("@angular/core").InputSignal<number>;',
    );
    expect(price).not.toContain('stale');

    const list = read(generated('src/list.d.tsrx.ts'));
    expect(list).toContain(`import { Price } from '@components/price.tsrx';`);
    expect(list).toContain('export declare function createPrice(): Price;');

    const baseUrlConsumer = read(generated('src/base-url.d.tsrx.ts'));
    expect(baseUrlConsumer).toContain(
      'export declare function createFromBaseUrl(): Price;',
    );

    expect(typeErrors()).toEqual([
      `Type 'number' is not assignable to type 'string'.`,
    ]);
  });

  it('discovers all .tsrx files in apps/tsrx-app via tsconfig.app.json', () => {
    const appRoot = join(import.meta.dirname, '../../../../apps/tsrx-app');
    const files = new TsrxTypeGenerator({
      tsconfig: join(appRoot, 'tsconfig.app.json'),
    }).findTsrxFiles();

    expect(files).toContain(join(appRoot, 'src/app/app.tsrx'));
    expect(files).toContain(join(appRoot, 'src/app/components/price.tsrx'));
    expect(files).toContain(join(appRoot, 'src/app/pages/(home).page.tsrx'));
  });
});
