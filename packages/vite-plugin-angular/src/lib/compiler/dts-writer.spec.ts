import { describe, it, expect } from 'vitest';
import { injectDtsDeclarations } from './dts-writer';

describe('injectDtsDeclarations', () => {
  it('splices members into the matching class and adds the i0 import', () => {
    const source = `export declare class ButtonComponent {\n}\n`;
    const out = injectDtsDeclarations(source, [
      {
        className: 'ButtonComponent',
        members:
          'static ɵfac: i0.ɵɵFactoryDeclaration<ButtonComponent, never>;\n' +
          'static ɵcmp: i0.ɵɵComponentDeclaration<ButtonComponent, "app-button", never, {}, {}, never, ["*"], true, never>;',
      },
    ]);

    expect(out).toContain('import * as i0 from "@angular/core";');
    expect(out).toContain(
      'static ɵfac: i0.ɵɵFactoryDeclaration<ButtonComponent, never>;',
    );
    expect(out).toContain(
      'static ɵcmp: i0.ɵɵComponentDeclaration<ButtonComponent',
    );

    const facIdx = out.indexOf('ɵfac');
    const classIdx = out.indexOf('class ButtonComponent');
    const closeIdx = out.lastIndexOf('}');
    expect(classIdx).toBeLessThan(facIdx);
    expect(facIdx).toBeLessThan(closeIdx);
  });

  it('handles bundled `declare class` (no export) form', () => {
    const source = `declare class Svc {\n}\nexport { Svc };\n`;
    const out = injectDtsDeclarations(source, [
      {
        className: 'Svc',
        members: 'static ɵprov: i0.ɵɵInjectableDeclaration<Svc>;',
      },
    ]);
    expect(out).toContain('static ɵprov: i0.ɵɵInjectableDeclaration<Svc>;');
  });

  it('is idempotent', () => {
    const source = `export declare class Foo {\n}\n`;
    const decls = [
      {
        className: 'Foo',
        members: 'static ɵfac: i0.ɵɵFactoryDeclaration<Foo, never>;',
      },
    ];
    const once = injectDtsDeclarations(source, decls);
    const twice = injectDtsDeclarations(once, decls);
    expect(twice).toBe(once);
    expect(once.match(/ɵfac/g)).toHaveLength(1);
  });

  it('does not add a duplicate i0 import when one already exists', () => {
    const source =
      'import * as i0 from "@angular/core";\nexport declare class Foo {\n}\n';
    const out = injectDtsDeclarations(source, [
      {
        className: 'Foo',
        members: 'static ɵfac: i0.ɵɵFactoryDeclaration<Foo, never>;',
      },
    ]);
    expect(out.match(/@angular\/core/g)).toHaveLength(1);
  });

  it('keeps the i0 import after triple-slash references', () => {
    const source =
      '/// <reference types="node" />\nexport declare class Foo {\n}\n';
    const out = injectDtsDeclarations(source, [
      {
        className: 'Foo',
        members: 'static ɵfac: i0.ɵɵFactoryDeclaration<Foo, never>;',
      },
    ]);
    expect(out.indexOf('/// <reference')).toBeLessThan(
      out.indexOf('import * as i0'),
    );
  });

  it('leaves files without a matching class untouched', () => {
    const source = `export declare class Other {\n}\n`;
    const out = injectDtsDeclarations(source, [
      {
        className: 'Missing',
        members: 'static ɵfac: i0.ɵɵFactoryDeclaration<Missing, never>;',
      },
    ]);
    expect(out).toBe(source);
  });
});
