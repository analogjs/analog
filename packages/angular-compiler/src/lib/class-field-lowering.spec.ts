import { describe, it, expect } from 'vitest';
import { compile } from './compile';
import { expectCompiles } from './test-helpers';

function compileWithLowering(code: string, fileName = 'test.ts'): string {
  return compile(code, fileName, { useDefineForClassFields: false }).code;
}

describe('class field lowering (useDefineForClassFields: false)', () => {
  it('lowers regular field initializers to constructor assignments', () => {
    const result = compileWithLowering(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        name = 'hello';
        count = 42;
      }
    `);

    expectCompiles(result);
    // Fields should be in constructor
    expect(result).toContain('this.name = ');
    expect(result).toContain('this.count = ');
    // Should not have field declarations with initializers in class body
    expect(result).not.toMatch(/^\s+name = /m);
    expect(result).not.toMatch(/^\s+count = /m);
  });

  it('lowers inject() calls to constructor assignments', () => {
    const result = compileWithLowering(`
      import { Component, inject } from '@angular/core';
      class MyService { onClose: any; }
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        private svc = inject(MyService);
      }
    `);

    expectCompiles(result);
    expect(result).toContain('this.svc = inject(MyService)');
  });

  it('preserves private field declarations while moving initializers', () => {
    const result = compileWithLowering(`
      import { Component, signal } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        #view = signal('home');
      }
    `);

    expectCompiles(result);
    // Private field declaration should be kept (without initializer)
    expect(result).toMatch(/#view\s*;/);
    // Initializer should be in constructor
    expect(result).toContain("this.#view = signal('home')");
  });

  it('inserts assignments after super() in subclasses', () => {
    const result = compileWithLowering(`
      import { Component, inject } from '@angular/core';
      class ParentClass { constructor() {} }
      class MyService { onClose: any; }
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent extends ParentClass {
        private svc = inject(MyService);
        constructor() {
          super();
          console.log('after');
        }
      }
    `);

    expectCompiles(result);
    // Assignment should be after super() and before console.log
    const superIdx = result.indexOf('super()');
    const assignIdx = result.indexOf('this.svc = inject(MyService)');
    const logIdx = result.indexOf("console.log('after')");
    expect(superIdx).toBeLessThan(assignIdx);
    expect(assignIdx).toBeLessThan(logIdx);
  });

  it('creates constructor when none exists', () => {
    const result = compileWithLowering(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        name = 'hello';
      }
    `);

    expectCompiles(result);
    expect(result).toContain('constructor()');
    expect(result).toContain("this.name = 'hello'");
  });

  it('creates constructor with super(...args) for subclasses without constructor', () => {
    const result = compileWithLowering(`
      import { Component, inject } from '@angular/core';
      class Base {}
      class MyService {}
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent extends Base {
        svc = inject(MyService);
      }
    `);

    expectCompiles(result);
    expect(result).toContain('super(...args)');
    expect(result).toContain('this.svc = inject(MyService)');
  });

  it('does not lower static fields', () => {
    const result = compileWithLowering(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        static count = 0;
        name = 'hello';
      }
    `);

    expectCompiles(result);
    // Static field should remain as-is
    expect(result).toMatch(/static\s+count\s*=\s*0/);
    // Instance field should be in constructor
    expect(result).toContain("this.name = 'hello'");
  });

  it('does not lower fields without initializers', () => {
    const result = compileWithLowering(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        name: string;
        count = 42;
      }
    `);

    expectCompiles(result);
    // name: string has no initializer, should stay (as TS type annotation)
    expect(result).toContain('name:');
    // count should be lowered
    expect(result).toContain('this.count = 42');
  });

  it('preserves field order in constructor assignments', () => {
    const result = compileWithLowering(`
      import { Component, inject, signal } from '@angular/core';
      class MyService { onClose: any; }
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        private svc = inject(MyService);
        #event$ = this.svc.onClose;
        #view = signal('home');
        view = this.#view.asReadonly();
      }
    `);

    expectCompiles(result);
    const svcIdx = result.indexOf('this.svc = inject(MyService)');
    const eventIdx = result.indexOf('this.#event$ = this.svc.onClose');
    const viewIdx = result.indexOf("this.#view = signal('home')");
    const readonlyIdx = result.indexOf('this.view = this.#view.asReadonly()');

    expect(svcIdx).toBeGreaterThan(-1);
    expect(eventIdx).toBeGreaterThan(svcIdx);
    expect(viewIdx).toBeGreaterThan(eventIdx);
    expect(readonlyIdx).toBeGreaterThan(viewIdx);
  });

  it('lowers by default (useDefineForClassFields defaults to false)', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        name = 'hello';
      }
    `,
      'test.ts',
    ).code;

    expectCompiles(result);
    // Default should lower fields
    expect(result).toContain("this.name = 'hello'");
  });

  it('does not lower when useDefineForClassFields is explicitly true', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        name = 'hello';
      }
    `,
      'test.ts',
      { useDefineForClassFields: true },
    ).code;

    expectCompiles(result);
    // Field should remain as class field
    expect(result).toMatch(/name\s*=\s*'hello'/);
    // Should NOT have constructor assignment
    expect(result).not.toContain('this.name');
  });

  it('preserves Ivy static definitions', () => {
    const result = compileWithLowering(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        name = 'hello';
      }
    `);

    expectCompiles(result);
    // Ivy definitions should still be present
    expect(result).toContain('ɵfac');
    expect(result).toContain('ɵcmp');
  });

  it('preserves Ivy static definitions when closing brace is unindented', () => {
    // Regression test: when the trailing field's newline is immediately
    // followed by `}` (no indentation), the lowering's removal range used to
    // end exactly where Ivy code was appendLeft-inserted, causing MagicString
    // to swallow the Ivy fields. Caught by analog-app-e2e against /shipping.
    const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-test', template: '<div></div>' })
export default class TestComponent {
  name = 'hello';
}
`;
    const result = compile(code, 'test.ts', {
      useDefineForClassFields: false,
    }).code;

    expectCompiles(result);
    expect(result).toContain('ɵfac');
    expect(result).toContain('ɵcmp');
    expect(result).toContain("this.name = 'hello'");
  });

  it('lowers string-literal field key with bracket access', () => {
    // Without bracket access, `this.'some-key' = …` is invalid JS and OXC
    // throws "Cannot assign to this expression" during pre-transform.
    const result = compileWithLowering(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        'some-key' = 'value';
      }
    `);

    expectCompiles(result);
    expect(result).toContain(`this["some-key"] = 'value'`);
    expect(result).not.toContain(`this.'some-key'`);
  });

  it('lowers numeric field key with bracket access', () => {
    const result = compileWithLowering(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        123 = 'value';
      }
    `);

    expectCompiles(result);
    expect(result).toContain(`this[123] = 'value'`);
  });

  it('lowers computed field key with bracket access', () => {
    const result = compileWithLowering(`
      import { Component } from '@angular/core';
      const KEY = 'foo';
      @Component({ selector: 'app-test', template: '<div></div>' })
      export class TestComponent {
        [KEY] = 'value';
      }
    `);

    expectCompiles(result);
    expect(result).toContain(`this[KEY] = 'value'`);
    expect(result).not.toContain(`this.[KEY]`);
  });
});
