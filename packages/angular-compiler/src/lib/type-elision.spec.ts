import { describe, it, expect } from 'vitest';
import MagicString from 'magic-string';
import {
  detectTypeOnlyImportNames,
  elideTypeOnlyImports,
  elideTypeOnlyImportsMagicString,
} from './type-elision';
import { compileCode as compile, expectCompiles } from './test-helpers';
import { compile as rawCompile } from './compile';

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

  it('preserves constructor parameter types of decorated classes as DI tokens', () => {
    // Constructor parameter types are TS type positions, but for decorated
    // classes they double as runtime DI tokens. Without preservation the
    // import would be elided and ɵfac would emit ɵɵinvalidFactory().
    const code = `
      import { Component } from '@angular/core';
      import { MyService } from './my-service';
      @Component({ selector: 'app-foo', template: '' })
      export class FooComponent {
        constructor(private svc: MyService) {}
      }
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('MyService');
  });

  it('preserves DI token types when constructor uses TSParameterProperty', () => {
    const code = `
      import { Directive } from '@angular/core';
      import { Service } from './service';
      @Directive({ selector: '[d]' })
      export class D {
        constructor(public svc: Service) {}
      }
    `;
    const result = detectTypeOnlyImportNames(code);
    expect(result).not.toContain('Service');
  });

  it('still elides type-only imports for non-decorated classes', () => {
    const code = `
      import { Helper } from './helper';
      class Plain {
        constructor(h: Helper) {}
      }
    `;
    const result = detectTypeOnlyImportNames(code);
    // Plain (non-decorated) class — no DI, type-only is correct
    expect(result).toContain('Helper');
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

describe('Sourcemap accuracy after type-only import elision', () => {
  it('produces sourcemap aligned with post-elision code', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      import { SomeType } from './models';

      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export class TestComponent {
        value: SomeType = {} as any;
      }
    `,
      'test.ts',
    );

    // SomeType should be elided from the output
    expect(result.code).not.toContain("from './models'");

    // Sourcemap should exist and reference the original source
    expect(result.map).toBeTruthy();
    expect(result.map.sources).toContain('test.ts');

    // Mappings should be non-empty
    expect(result.map.mappings.length).toBeGreaterThan(0);

    // The sourcemap's sourcesContent should contain the original source
    expect(result.map.sourcesContent).toBeTruthy();
    expect(result.map.sourcesContent[0]).toContain('import { SomeType }');
  });

  it('preserves sourcemap accuracy when no imports are elided', () => {
    const result = rawCompile(
      `
      import { Component, signal } from '@angular/core';

      @Component({ selector: 'app-test', template: '{{ count() }}' })
      export class TestComponent {
        count = signal(0);
      }
    `,
      'test.ts',
    );

    expect(result.code).toContain('signal');
    expect(result.map).toBeTruthy();
    expect(result.map.mappings.length).toBeGreaterThan(0);
  });
});

describe('type-elision preserves TSAsExpression value references', () => {
  it('does not elide imports used inside as-casts', () => {
    const typeOnly = detectTypeOnlyImportNames(`
      import data from './data.json';
      type MyType = { name: string };
      const items = (data as MyType[]).map(x => x.name);
    `);
    expect(typeOnly.has('data')).toBe(false);
  });

  it('does not elide imports used inside satisfies expressions', () => {
    const typeOnly = detectTypeOnlyImportNames(`
      import { config } from './config';
      type Config = { port: number };
      const c = config satisfies Config;
    `);
    expect(typeOnly.has('config')).toBe(false);
  });

  it('still elides truly type-only imports', () => {
    const typeOnly = detectTypeOnlyImportNames(`
      import { MyInterface } from './types';
      const x: MyInterface = { name: 'test' };
    `);
    expect(typeOnly.has('MyInterface')).toBe(true);
  });
});

describe('constant pool helpers survive type-only import elision', () => {
  it('emits @for template functions when last import is type-only', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';
      import { UnifiedPost } from '../data/posts';

      @Component({
        selector: 'app-posts',
        template: \`
          @for (post of posts(); track post.slug) {
            <p>{{ post.title }}</p>
          }
        \`
      })
      export class PostsComponent {
        posts = input<UnifiedPost[]>([]);
      }
    `,
      'posts.component.ts',
    );

    expectCompiles(result);
    // Template helper must be defined, not just referenced
    expect(result).toMatch(/function PostsComponent_For_\d+_Template/);
    expect(result).toContain('ɵɵrepeaterCreate');
    // Type-only import should be elided
    expect(result).not.toContain('import { UnifiedPost }');
  });

  it('emits @for track function when last import is type-only', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';
      import { Item } from './models';

      @Component({
        selector: 'app-list',
        template: \`
          @for (item of items(); track item.id) {
            <span>{{ item.name }}</span>
          }
        \`
      })
      export class ListComponent {
        items = input<Item[]>([]);
      }
    `,
      'list.component.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/_forTrack\d/);
    expect(result).not.toContain('import { Item }');
  });

  it('emits helpers when multiple trailing imports are type-only', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';
      import { TypeA } from './types-a';
      import { TypeB } from './types-b';

      @Component({
        selector: 'app-multi',
        template: \`
          @for (item of items(); track item) {
            <p>{{ item }}</p>
          }
        \`
      })
      export class MultiComponent {
        items = input<TypeA[]>([]);
        other: TypeB | undefined;
      }
    `,
      'multi.component.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/function MultiComponent_For_\d+_Template/);
    expect(result).not.toContain('import { TypeA }');
    expect(result).not.toContain('import { TypeB }');
  });
});

describe('Hoisted nested-template helpers survive type-only import elision', () => {
  // Repro of a real bug: a component with @if/@for/@switch blocks emits
  // helper functions like `MyComponent_Conditional_0_Template` that are
  // referenced from `static ɵcmp = ...`. They are hoisted via
  // `ms.appendLeft(insertPos, ...)` where `insertPos === stmt.getEnd()` of
  // the last import. When the previous-step type-elision pass rewrites a
  // mixed `import { SomeType, someValue }` declaration via
  // `ms.overwrite(node.start, node.end, ...)`, the `;` of that import sits
  // inside the overwrite range. With `appendLeft`, the helpers were bound
  // to the `;` and got wiped — leaving the component referencing undefined
  // symbols. Fix: use `appendRight` so helpers bind to the character to the
  // RIGHT of insertPos, which is outside the overwrite range.

  it('emits @if conditional helpers when the file has a mixed type/value import', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { SomeType, someValue } from './other';
      @Component({
        selector: 'app-cond',
        template: \`
          @if (!flag) {
            <span>off</span>
          }
          <div>
            @if (flag) {
              <span>on</span>
            }
          </div>
        \`,
      })
      export class CondComponent {
        flag: SomeType = someValue();
      }
    `,
      'cond.ts',
    );

    expectCompiles(result);
    // Both nested template helper functions must be present in the output.
    // Without the appendRight fix they get wiped by the type-elision
    // overwrite of the `import { SomeType, someValue }` declaration.
    expect(result).toMatch(/function\s+CondComponent_Conditional_0_Template/);
    expect(result).toMatch(/function\s+CondComponent_Conditional_2_Template/);
    // The helpers must be hoisted ABOVE the class declaration so the
    // static ɵcmp initializer can reference them.
    const cond0Pos = result.indexOf(
      'function CondComponent_Conditional_0_Template',
    );
    const classPos = result.indexOf('export class CondComponent');
    expect(cond0Pos).toBeGreaterThan(-1);
    expect(classPos).toBeGreaterThan(-1);
    expect(cond0Pos).toBeLessThan(classPos);
  });

  it('still emits @if helpers when the file has only value imports (regression guard)', () => {
    // The non-elision path must keep working too. Same component shape as
    // above but with no type-only specifiers, so the elision pass is a no-op.
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-simple-cond',
        template: \`
          @if (flag) {
            <span>on</span>
          }
        \`,
      })
      export class SimpleCondComponent {
        flag = true;
      }
    `,
      'simple-cond.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(
      /function\s+SimpleCondComponent_Conditional_0_Template/,
    );
  });
});
