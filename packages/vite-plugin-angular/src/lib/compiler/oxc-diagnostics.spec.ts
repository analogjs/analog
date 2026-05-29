import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';

import { oxcTransform } from './oxc-engine.js';

const ctx = async (): Promise<Parameters<typeof oxcTransform>[2]> => ({
  resolvedConfig: await resolveConfig({}, 'serve'),
  inlineStylesExtension: 'css',
  liveReload: false,
  watchMode: false,
  jit: false,
});

describe('OXC adapter diagnostic surfacing', () => {
  it('returns structured diagnostics instead of throwing on compile errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oxc-diag-'));
    const file = join(dir, 'broken.component.ts');
    // Two `*` template-prefix bindings on the same element — Angular's
    // template parser surfaces this as a structured error. The contract
    // under test is "errors come back on `diagnostics`, not as a throw",
    // not a specific message string.
    const src = `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-broken',
        template: '<div *ngIf="a" *ngFor="let b of items"></div>',
      })
      export class BrokenComponent { a = true; items = []; }
    `;
    const result = await oxcTransform(src, file, await ctx());

    const errors = result.diagnostics.filter((d) => d.severity === 'Error');
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      // Headline message preserved.
      expect(e.message).toBeTruthy();
      // `formatted` is what `this.error()` receives — should start with
      // the `[oxc-angular]` prefix so the dev-server overlay attributes
      // the diagnostic to this plugin.
      expect(e.formatted).toMatch(/\[oxc-angular\]/);
    }
  });

  it('returns an empty diagnostics array for a clean compile', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oxc-diag-clean-'));
    const file = join(dir, 'fine.component.ts');
    const src = `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-fine',
        template: '<h1>Hello</h1>',
      })
      export class FineComponent {}
    `;
    const result = await oxcTransform(src, file, await ctx());
    expect(result.diagnostics).toEqual([]);
  });
});
