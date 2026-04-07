import { describe, it, expect } from 'vitest';
import MagicString from 'magic-string';
import {
  detectTypeOnlyImportNames,
  elideTypeOnlyImports,
  elideTypeOnlyImportsMagicString,
} from './type-elision';
import { compileCode as compile } from './test-helpers';

describe('detectTypeOnlyImportNames', () => {
  it('detects imports used only in type annotations', () => {
    const code = `
      import { Foo } from 'foo';
      const x: Foo = {};
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Foo');
  });

  it('does not flag imports used as values', () => {
    const code = `
      import { Foo } from 'foo';
      const x = new Foo();
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Foo');
  });

  it('handles mixed imports (some type-only, some value)', () => {
    const code = `
      import { MyType, MyClass } from 'lib';
      const x: MyType = new MyClass();
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('MyType');
    expect(result).not.toContain('MyClass');
  });

  it('detects imports used only in implements clauses', () => {
    const code = `
      import { OnInit } from '@angular/core';
      class Foo implements OnInit {
        ngOnInit() {}
      }
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('OnInit');
  });

  it('detects imports used only in return types', () => {
    const code = `
      import { Observable } from 'rxjs';
      function getData(): Observable<string> { return null; }
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Observable');
  });

  it('detects imports used only in generic type arguments', () => {
    const code = `
      import { Signal } from '@angular/core';
      import { User } from './models';
      const users: Signal<User[]> = null;
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Signal');
    expect(result).toContain('User');
  });

  it('skips already type-only imports (import type)', () => {
    const code = `
      import type { Foo } from 'foo';
      const x: Foo = {};
    `;
    const result = detectTypeOnlyImportNames(code);
    // Should not include Foo since it's already syntactically type-only
    expect(result).not.toContain('Foo');
  });

  it('skips inline type specifiers (import { type X })', () => {
    const code = `
      import { type Foo } from 'foo';
      const x: Foo = {};
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Foo');
  });

  it('does not flag imports used in function calls', () => {
    const code = `
      import { inject } from '@angular/core';
      import { UserService } from './user.service';
      const svc = inject(UserService);
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('inject');
    expect(result).not.toContain('UserService');
  });

  it('detects unused imports as type-only', () => {
    const code = `
      import { Unused } from 'lib';
      const x = 1;
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Unused');
  });

  it('detects default imports used only as types', () => {
    const code = `
      import Foo from 'foo';
      const x: Foo = {};
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Foo');
  });

  it('does not flag default imports used as values', () => {
    const code = `
      import Foo from 'foo';
      const x = new Foo();
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Foo');
  });

  it('handles constructor parameter type annotations', () => {
    const code = `
      import { Router } from '@angular/router';
      import { UserService } from './user.service';
      class Foo {
        constructor(private router: Router) {
          this.svc = new UserService();
        }
        private svc: UserService;
      }
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Router');
    expect(result).not.toContain('UserService');
  });

  it('detects imports used only in export type declarations', () => {
    const code = `
      import { Foo } from 'foo';
      export type { Foo };
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Foo');
  });

  it('detects imports used only in inline type export specifiers', () => {
    const code = `
      import { Foo } from 'foo';
      export { type Foo };
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Foo');
  });

  it('does not flag imports used in value re-exports', () => {
    const code = `
      import { Foo } from 'foo';
      export { Foo };
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Foo');
  });

  it('handles mixed type and value export specifiers', () => {
    const code = `
      import { Foo, Bar } from 'lib';
      export { type Foo, Bar };
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Foo');
    expect(result).not.toContain('Bar');
  });

  it('does not elide type-exported import that is also used as value', () => {
    const code = `
      import { Foo } from 'foo';
      export type { Foo };
      const x = new Foo();
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Foo');
  });

  it('preserves imports used in export declarations', () => {
    const code = `
      import { Foo } from 'foo';
      export const x = new Foo();
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Foo');
  });

  it('detects typeof in type position as type-only', () => {
    const code = `
      import { Foo } from 'foo';
      function bar(x: typeof Foo) {}
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).toContain('Foo');
  });

  it('preserves imports used as enum value and type', () => {
    const code = `
      import { Status } from './enums';
      const x: Status = Status.Active;
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Status');
  });

  it('preserves imports used in class extends (value position)', () => {
    const code = `
      import { Base } from './base';
      class Child extends Base {}
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Base');
  });

  it('preserves imports used in instanceof checks', () => {
    const code = `
      import { Foo } from 'foo';
      const y = x instanceof Foo;
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Foo');
  });

  it('handles class extends (value) + implements (type) correctly', () => {
    const code = `
      import { Base, Iface } from 'lib';
      class Child extends Base implements Iface {}
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Base');
    expect(result).toContain('Iface');
  });
});

describe('elideTypeOnlyImports', () => {
  it('removes entire import when all specifiers are type-only', () => {
    const code = `import { MyType } from 'lib';\nconst x: MyType = {};\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).not.toContain("from 'lib'");
    expect(result).toContain('const x');
  });

  it('removes only type-only specifiers from mixed imports', () => {
    const code = `import { MyType, MyClass } from 'lib';\nconst x: MyType = new MyClass();\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).toContain('MyClass');
    expect(result).toContain("from 'lib'");
    expect(result).not.toMatch(/\bMyType\b.*from/);
  });

  it('preserves value imports untouched', () => {
    const code = `import { inject } from '@angular/core';\nconst x = inject(Service);\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).toContain("import { inject } from '@angular/core'");
  });

  it('returns original code when nothing to elide', () => {
    const code = `import { A, B } from 'lib';\nconst x = A; const y = B;\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).toBe(code);
  });

  it('removes default import used only as type', () => {
    const code = `import Foo from 'foo';\nconst x: Foo = {};\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).not.toContain("from 'foo'");
    expect(result).toContain('const x');
  });

  it('preserves default import used as value', () => {
    const code = `import Foo from 'foo';\nconst x = new Foo();\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).toContain("import Foo from 'foo'");
  });

  it('elides default but keeps named specifiers', () => {
    const code = `import Foo, { bar } from 'lib';\nconst x: Foo = bar();\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).toContain("import { bar } from 'lib'");
    expect(result).not.toMatch(/\bFoo\b.*from/);
  });

  it('elides named but keeps default specifier', () => {
    const code = `import Foo, { MyType } from 'lib';\nconst x: MyType = new Foo();\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).toContain("import Foo from 'lib'");
    // MyType removed from import specifiers (still in type annotation, which OXC strips)
    expect(result).not.toMatch(/import.*MyType.*from/);
  });

  it('elides both default and named when all type-only', () => {
    const code = `import Foo, { Bar } from 'lib';\nconst x: Foo = {} as Bar;\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).not.toContain("from 'lib'");
  });

  it('handles multiple declarations with partial elision', () => {
    const code = [
      `import { TypeA, valueA } from 'a';`,
      `import { TypeB } from 'b';`,
      `import { valueC } from 'c';`,
      `const x: TypeA = valueA();`,
      `const y: TypeB = {};`,
      `const z = valueC();`,
    ].join('\n');

    const result = elideTypeOnlyImports(code);
    // TypeA removed from 'a', valueA kept
    expect(result).toContain('valueA');
    expect(result).toContain("from 'a'");
    // Entire 'b' import removed
    expect(result).not.toContain("from 'b'");
    // 'c' import fully preserved
    expect(result).toContain("import { valueC } from 'c'");
  });

  it('handles CRLF line endings when removing imports', () => {
    const code = `import { MyType } from 'lib';\r\nimport { value } from 'other';\r\nconst x: MyType = value();\r\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).not.toContain("from 'lib'");
    expect(result).toContain("import { value } from 'other'");
    // No stray \r left behind from the removed import
    expect(result).not.toMatch(/^\r/m);
  });

  it('elides import used only in export type re-export', () => {
    const code = `import { Foo } from 'foo';\nexport type { Foo };\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).not.toContain("from 'foo'");
  });

  it('elides import used only in inline type export specifier', () => {
    const code = `import { Foo, Bar } from 'lib';\nexport { type Foo, Bar };\n`;
    const result = elideTypeOnlyImports(code);
    // Foo elided from import, Bar kept
    expect(result).toContain('Bar');
    expect(result).toContain("from 'lib'");
    expect(result).not.toMatch(/import\s*\{[^}]*Foo[^}]*\}\s*from/);
  });

  it('preserves import used in value re-export', () => {
    const code = `import { Foo } from 'foo';\nexport { Foo };\n`;
    const result = elideTypeOnlyImports(code);
    expect(result).toContain("import { Foo } from 'foo'");
  });
});

describe('elideTypeOnlyImportsMagicString', () => {
  it('applies elision edits to MagicString', () => {
    const code = `import { MyType } from 'lib';\nconst x: MyType = {};\n`;
    const ms = new MagicString(code);
    elideTypeOnlyImportsMagicString(ms);
    expect(ms.toString()).not.toContain("from 'lib'");
    expect(ms.toString()).toContain('const x');
  });

  it('produces a valid sourcemap after elision', () => {
    const code = `import { MyType } from 'lib';\nimport { value } from 'other';\nconst x: MyType = value();\n`;
    const ms = new MagicString(code);
    elideTypeOnlyImportsMagicString(ms);
    const map = ms.generateMap({ source: 'test.ts', hires: true });
    // Map should reference the original source
    expect(map.sources).toContain('test.ts');
    // Mappings should be non-empty (not an identity map)
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  it('detects type-only names from mutated code, positions from original', () => {
    // Simulate compile.ts: MagicString has been mutated (appended code)
    // but import positions match original
    const original = `import { MyType, MyClass } from 'lib';\nconst x: MyType = new MyClass();\n`;
    const ms = new MagicString(original);
    // Simulate Ivy injection (appended code that references MyClass)
    ms.append('\n// i0.ɵɵdirectiveInject(MyClass);');
    elideTypeOnlyImportsMagicString(ms);
    const result = ms.toString();
    // MyClass is value-referenced (in appended code) — should be kept
    expect(result).toContain('MyClass');
    // MyType is type-only — should be removed from import
    expect(result).not.toMatch(/import\s*\{[^}]*MyType[^}]*\}\s*from/);
  });
});

describe('type elision in compiler output', () => {
  it('elides type-only imports from compiled component output', () => {
    const code = `
      import { Component } from '@angular/core';
      import { SomeType } from './models';

      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export class TestComponent {
        value: SomeType = {} as any;
      }
    `;
    const result = compile(code, 'test.ts');
    // SomeType is only in type annotation — should be elided
    expect(result).not.toContain("from './models'");
    // Component decorator should be compiled away
    expect(result).not.toContain('@Component');
    expect(result).toContain('ɵcmp');
  });

  it('preserves value imports used in inject()', () => {
    const code = `
      import { Component, inject } from '@angular/core';
      import { UserService } from './user.service';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        private svc = inject(UserService);
      }
    `;
    const result = compile(code, 'test.ts');
    expect(result).toContain('UserService');
    expect(result).toContain("from './user.service'");
  });

  it('elides interface-only imports (implements)', () => {
    const code = `
      import { Component, OnInit, OnDestroy } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent implements OnInit, OnDestroy {
        ngOnInit() {}
        ngOnDestroy() {}
      }
    `;
    const result = compile(code, 'test.ts');
    // OnInit/OnDestroy should be removed from the import specifiers
    // (they still appear in the `implements` clause which OXC will strip)
    expect(result).not.toMatch(/import\s*\{[^}]*OnInit[^}]*\}\s*from/);
    expect(result).not.toMatch(/import\s*\{[^}]*OnDestroy[^}]*\}\s*from/);
  });

  it('elides type-only generic parameters', () => {
    const code = `
      import { Component, signal } from '@angular/core';
      import { User } from './models';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        users = signal<User[]>([]);
      }
    `;
    const result = compile(code, 'test.ts');
    // User is only in generic type arg — should be elided
    expect(result).not.toContain("from './models'");
    // signal should still be present as a value
    expect(result).toContain('signal');
  });
});
