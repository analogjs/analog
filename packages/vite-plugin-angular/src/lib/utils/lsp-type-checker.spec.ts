import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LspTypeChecker,
  resolveTypeChecker,
  type TypeCheckerOption,
} from './lsp-type-checker.js';

const root = resolve(import.meta.dirname, '../../../../..');
const tsconfig = resolve(root, 'apps/analog-app/tsconfig.app.json');
const pagesDir = resolve(root, 'apps/analog-app/src/app/pages');
const cartPath = resolve(pagesDir, 'cart.page.ts');
const searchPath = resolve(pagesDir, 'search.page.ts');

// NGP-style inline TCB: the block follows the class and source can follow the block
function inlineTcb(filePath: string, className: string, body: string) {
  const source = readFileSync(filePath, 'utf-8');
  return {
    source,
    tcb: `${source}\n/*tcb1*/\nfunction _tcb1(this: ${className}) {\n${body}\n}\n\nconst trailing: number = 'not a number';\n`,
  };
}

let checker: LspTypeChecker | undefined;
afterEach(() => {
  checker?.close();
  vi.unstubAllEnvs();
});

describe.each<TypeCheckerOption>(['tsgo', 'tsrs'])(
  'LspTypeChecker (%s)',
  (option) => {
    it('relocates inline TCBs without trailing source in build mode', async () => {
      checker = new LspTypeChecker(tsconfig, option);
      const search = inlineTcb(searchPath, 'NewsletterComponent', '');
      const cart = inlineTcb(cartPath, 'CartComponent', '(this).missing;');
      checker.queueFile(searchPath, search.source, search.tcb);
      checker.queueFile(cartPath, cart.source, cart.tcb);

      const errors = await checker.flushQueue();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`${cartPath} (template)`);
      expect(errors[0]).toContain("'missing'");
    });

    it('maps template errors to external template files', async () => {
      checker = new LspTypeChecker(tsconfig, option);
      const templateFile = resolve(pagesDir, 'shipping/shipping.html');
      const footer = `/*ngp-tcb-template-sources:${JSON.stringify({ tcb1: { templateFile } })}*/`;
      const search = inlineTcb(searchPath, 'NewsletterComponent', '');
      const cart = inlineTcb(
        cartPath,
        'CartComponent',
        '(this).missing /*0,5*/;',
      );
      checker.queueFile(searchPath, search.source, search.tcb);
      checker.queueFile(cartPath, cart.source, `${cart.tcb}${footer}\n`);

      expect(await checker.flushQueue()).toEqual([
        expect.stringContaining(`${templateFile}:1:1 - error TS2339`),
      ]);
    });

    it('checks the in-memory TCB of a document opened after another', async () => {
      checker = new LspTypeChecker(tsconfig, option);
      const search = inlineTcb(searchPath, 'NewsletterComponent', '');
      checker.queueFile(searchPath, search.source, search.tcb);
      await checker.flushQueue(true);

      const cart = inlineTcb(cartPath, 'CartComponent', '(this).missing;');
      checker.queueFile(cartPath, cart.source, cart.tcb);
      const errors = await checker.flushQueue(true);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("'missing'");
    });
  },
);

describe('LspTypeChecker startup', () => {
  it('runs tsrs through its launcher', () => {
    expect(resolveTypeChecker(tsconfig, 'tsrs')).toEqual({
      command: process.execPath,
      args: [
        realpathSync(resolve(root, 'node_modules/tsrs/bin/tsrs')),
        '--lsp',
        '--stdio',
      ],
    });
  });

  it('rejects requests when the type checker cannot start', async () => {
    vi.stubEnv('TSNATIVE_BINARY_PATH', resolve(root, 'missing-checker'));
    checker = new LspTypeChecker(tsconfig);
    checker.queueFile(cartPath, readFileSync(cartPath, 'utf-8'));
    await expect(checker.flushQueue()).rejects.toThrow('ENOENT');
    checker.queueFile(searchPath, readFileSync(searchPath, 'utf-8'));
    await expect(checker.flushQueue()).rejects.toThrow('ENOENT');
  });

  it('spawns a custom type checker command', async () => {
    checker = new LspTypeChecker(tsconfig, {
      command: process.execPath,
      args: [resolve(root, 'node_modules/tsrs/bin/tsrs'), '--lsp', '--stdio'],
    });
    const cart = inlineTcb(cartPath, 'CartComponent', '(this).missing;');
    checker.queueFile(cartPath, cart.source, cart.tcb);
    const errors = await checker.flushQueue();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'missing'");
  });
});
