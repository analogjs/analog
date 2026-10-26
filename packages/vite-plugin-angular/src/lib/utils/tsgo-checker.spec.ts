import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TsgoChecker } from './tsgo-checker.js';

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

describe('TsgoChecker', () => {
  let tsgo: TsgoChecker | undefined;
  afterEach(() => {
    tsgo?.close();
    vi.unstubAllEnvs();
  });

  it('relocates inline TCBs without trailing source in build mode', async () => {
    tsgo = new TsgoChecker(tsconfig);
    const search = inlineTcb(searchPath, 'NewsletterComponent', '');
    const cart = inlineTcb(cartPath, 'CartComponent', '(this).missing;');
    tsgo.queueFile(searchPath, search.source, search.tcb);
    tsgo.queueFile(cartPath, cart.source, cart.tcb);

    const errors = await tsgo.flushQueue();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`${cartPath} (template)`);
    expect(errors[0]).toContain("'missing'");
  });

  it('maps template errors to external template files', async () => {
    tsgo = new TsgoChecker(tsconfig);
    const templateFile = resolve(pagesDir, 'shipping/shipping.html');
    const footer = `/*ngp-tcb-template-sources:${JSON.stringify({ tcb1: { templateFile } })}*/`;
    const search = inlineTcb(searchPath, 'NewsletterComponent', '');
    const cart = inlineTcb(
      cartPath,
      'CartComponent',
      '(this).missing /*0,5*/;',
    );
    tsgo.queueFile(searchPath, search.source, search.tcb);
    tsgo.queueFile(cartPath, cart.source, `${cart.tcb}${footer}\n`);

    expect(await tsgo.flushQueue()).toEqual([
      expect.stringContaining(`${templateFile}:1:1 - error TS2339`),
    ]);
  });

  it('rejects requests when tsgo cannot start', async () => {
    vi.stubEnv('TSGO_BINARY_PATH', resolve(root, 'missing-tsgo'));
    tsgo = new TsgoChecker(tsconfig);
    tsgo.queueFile(cartPath, readFileSync(cartPath, 'utf-8'));
    await expect(tsgo.flushQueue()).rejects.toThrow('ENOENT');
    tsgo.queueFile(searchPath, readFileSync(searchPath, 'utf-8'));
    await expect(tsgo.flushQueue()).rejects.toThrow('ENOENT');
  });

  it('checks the in-memory TCB of a document opened after another', async () => {
    tsgo = new TsgoChecker(tsconfig);
    const search = inlineTcb(searchPath, 'NewsletterComponent', '');
    tsgo.queueFile(searchPath, search.source, search.tcb);
    await tsgo.flushQueue(true);

    const cart = inlineTcb(cartPath, 'CartComponent', '(this).missing;');
    tsgo.queueFile(cartPath, cart.source, cart.tcb);
    const errors = await tsgo.flushQueue(true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'missing'");
  });
});
