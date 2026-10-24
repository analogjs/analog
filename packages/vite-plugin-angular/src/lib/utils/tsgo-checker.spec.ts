import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
  afterEach(() => tsgo?.close());

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
});
