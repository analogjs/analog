import { describe, it, expect } from 'vitest';
import { compile as rawCompile } from './compile';

function expectCompiles(result: string) {
  expect(result).toBeTruthy();
  expect(result).not.toMatch(/^Error:/m);
}

describe('i18n template compilation', () => {
  it('compiles component with i18n attribute to $localize call', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-hello',
        template: '<h1 i18n>Hello world</h1>',
      })
      export class HelloComponent {}
    `,
      'hello.component.ts',
    );
    expectCompiles(result.code);
    expect(result.code).toContain('$localize');
  });

  it('compiles i18n with interpolation expressions', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-greet',
        template: '<p i18n>Hello {{ name }}!</p>',
      })
      export class GreetComponent {
        name = 'World';
      }
    `,
      'greet.component.ts',
    );
    expectCompiles(result.code);
    expect(result.code).toContain('$localize');
  });

  it('compiles i18n with meaning and description', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-msg',
        template: '<span i18n="site header|Welcome message for users">Welcome</span>',
      })
      export class MsgComponent {}
    `,
      'msg.component.ts',
    );
    expectCompiles(result.code);
    expect(result.code).toContain('$localize');
  });

  it('compiles i18n attribute bindings (i18n-title)', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-attr',
        template: '<img title="Logo" i18n-title />',
      })
      export class AttrComponent {}
    `,
      'attr.component.ts',
    );
    expectCompiles(result.code);
    expect(result.code).toContain('$localize');
  });

  it('compiles i18n with ICU expression', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-icu',
        template: '<span i18n>{count, plural, =0 {none} =1 {one} other {many}}</span>',
      })
      export class IcuComponent {
        count = 0;
      }
    `,
      'icu.component.ts',
    );
    expectCompiles(result.code);
    expect(result.code).toContain('$localize');
  });

  it('compiles template without i18n normally (no $localize)', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-plain',
        template: '<h1>Hello world</h1>',
      })
      export class PlainComponent {}
    `,
      'plain.component.ts',
    );
    expectCompiles(result.code);
    expect(result.code).not.toContain('$localize');
  });
});
