import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';
import { oxcTransform } from './oxc-engine.js';

describe('OXC inline styles preprocessing', () => {
  it('compiles SCSS nesting in inline styles', async () => {
    const config = await resolveConfig({}, 'serve');
    const dir = mkdtempSync(join(tmpdir(), 'oxc-inline-scss-'));
    const file = join(dir, 'app.component.ts');
    const src = `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-root',
        template: '<h1>x</h1>',
        styles: ['.host { color: red; &:hover { color: blue; } }'],
      })
      export class AppComponent {}
    `;
    const result = await oxcTransform(src, file, {
      resolvedConfig: config,
      inlineStylesExtension: 'scss',
      liveReload: false,
      watchMode: false,
      jit: false,
    });

    // SCSS `&:hover` should expand to a flat selector with a space-or-no-space
    // ancestor reference. The exact form depends on the resolved Sass version
    // (`.host:hover` for modern dart-sass output).
    expect(result.code).toContain('.host:hover');
    expect(result.code).not.toContain('&:hover');
  });

  it('leaves css-extension inline styles untouched', async () => {
    const config = await resolveConfig({}, 'serve');
    const dir = mkdtempSync(join(tmpdir(), 'oxc-inline-css-'));
    const file = join(dir, 'app.component.ts');
    const src = `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-root',
        template: '<h1>x</h1>',
        styles: ['.host { color: red; }'],
      })
      export class AppComponent {}
    `;
    const result = await oxcTransform(src, file, {
      resolvedConfig: config,
      inlineStylesExtension: 'css',
      liveReload: false,
      watchMode: false,
      jit: false,
    });
    expect(result.code).toContain('.host');
    expect(result.code).toContain('color: red');
  });
});
