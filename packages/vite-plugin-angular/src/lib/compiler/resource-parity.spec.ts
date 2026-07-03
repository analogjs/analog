import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile } from './compile';
import { inlineResourceUrls } from './resource-inliner';
import type { ComponentRegistry } from './registry';

/**
 * Structural guard for the resource-inlining seam that the conformance suite
 * bypasses (it feeds inline code straight to `compile()`).
 *
 * A component authored with external `templateUrl` / `styleUrls` must emit the
 * exact same Ivy output as the same component authored inline. If the
 * resource-inlining pipeline ever diverges from the inline path (the class of
 * bug behind the external-`styleUrl` SCSS regression), the two outputs drift
 * and this test fails.
 */
const FIXTURES = path.join(__dirname, '__fixtures__');
const ID = path.join(FIXTURES, 'test.component.ts');

async function compileSource(src: string): Promise<string> {
  const registry: ComponentRegistry = new Map();
  return compile((await inlineResourceUrls(src, ID)).code, ID, {
    registry,
    useDefineForClassFields: true,
  }).code;
}

describe('resource inlining ↔ inline output parity', () => {
  it('emits identical Ivy for external templateUrl/styleUrls and their inline form', async () => {
    const html = fs.readFileSync(
      path.join(FIXTURES, 'test.component.html'),
      'utf-8',
    );
    const css = fs.readFileSync(
      path.join(FIXTURES, 'test.component.css'),
      'utf-8',
    );

    const external = `import { Component } from '@angular/core';
@Component({
  selector: 'app-parity',
  templateUrl: './test.component.html',
  styleUrls: ['./test.component.css'],
})
export class ParityComponent {}
`;

    const inline = `import { Component } from '@angular/core';
@Component({
  selector: 'app-parity',
  template: ${JSON.stringify(html)},
  styles: [${JSON.stringify(css)}],
})
export class ParityComponent {}
`;

    const externalOut = await compileSource(external);
    const inlineOut = await compileSource(inline);

    // Guard against a vacuous pass: real Ivy must have been emitted for both.
    expect(externalOut).toContain('ɵcmp');
    expect(externalOut).toContain('ParityComponent');

    expect(externalOut).toBe(inlineOut);
  });
});
