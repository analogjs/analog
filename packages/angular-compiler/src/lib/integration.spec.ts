import { describe, it, expect } from 'vitest';
import { scanFile } from './registry';
import { compile as rawCompile } from './compile';
import { compileCode as compile, buildRegistry } from './test-helpers';

describe('Registry input/output extraction', () => {
  it('extracts signal inputs from input()', () => {
    const entries = scanFile(
      `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        name = input<string>();
      }
    `,
      'child.ts',
    );

    expect(entries[0].inputs).toBeDefined();
    expect(entries[0].inputs!['name']).toEqual({
      classPropertyName: 'name',
      bindingPropertyName: 'name',
      isSignal: true,
      required: false,
    });
  });

  it('extracts required signal inputs from input.required()', () => {
    const entries = scanFile(
      `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        data = input.required<string>();
      }
    `,
      'child.ts',
    );

    expect(entries[0].inputs!['data']).toEqual({
      classPropertyName: 'data',
      bindingPropertyName: 'data',
      isSignal: true,
      required: true,
    });
  });

  it('extracts signal outputs from output()', () => {
    const entries = scanFile(
      `
      import { Component, output } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        clicked = output();
      }
    `,
      'child.ts',
    );

    expect(entries[0].outputs).toBeDefined();
    expect(entries[0].outputs!['clicked']).toBe('clicked');
  });

  it('extracts model() as input + output', () => {
    const entries = scanFile(
      `
      import { Component, model } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        value = model<string>();
      }
    `,
      'child.ts',
    );

    expect(entries[0].inputs!['value']).toEqual({
      classPropertyName: 'value',
      bindingPropertyName: 'value',
      isSignal: true,
      required: false,
    });
    expect(entries[0].outputs!['valueChange']).toBe('valueChange');
  });

  it('extracts @Input decorator-based inputs', () => {
    const entries = scanFile(
      `
      import { Component, Input } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        @Input() title: string;
      }
    `,
      'child.ts',
    );

    expect(entries[0].inputs!['title']).toEqual({
      classPropertyName: 'title',
      bindingPropertyName: 'title',
      isSignal: false,
      required: false,
    });
  });
});

describe('Cross-component input binding', () => {
  it('resolves signal input bindings via registry', () => {
    const childSrc = `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-child', template: '{{ name() }}' })
      export class ChildComponent {
        name = input.required<string>();
      }
    `;

    const parentSrc = `
      import { Component } from '@angular/core';
      import { ChildComponent } from './child';
      @Component({
        selector: 'app-parent',
        imports: [ChildComponent],
        template: '<app-child [name]="title" />'
      })
      export class ParentComponent {
        title = 'Hello';
      }
    `;

    const registry = buildRegistry({ 'child.ts': childSrc });
    const result = compile(parentSrc, 'parent.ts', registry);

    expectCompiles(result);
    // The [name] binding should be compiled as a property instruction
    expect(result).toContain('ɵɵproperty("name"');
  });
});

describe('Constant pool ordering', () => {
  it('emits helper declarations before the class', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-list',
        template: \`
          @for (item of items; track item.id) {
            <div>{{ item.name }}</div>
          }
        \`
      })
      export class ListComponent {
        items = [{id: 1, name: 'a'}];
      }
    `,
      'list.ts',
    );

    expectCompiles(result);
    // Track function should be defined before the class
    const trackIdx = result.indexOf('_forTrack0');
    const classIdx = result.indexOf('class ListComponent');
    expect(trackIdx).toBeLessThan(classIdx);
  });

  it('emits helpers before export default class', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-page',
        template: \`
          @for (item of items; track item) {
            <span>{{ item }}</span>
          }
        \`
      })
      export default class PageComponent {
        items = ['a', 'b'];
      }
    `,
      'page.ts',
    );

    expectCompiles(result);
    // No 'export default const' syntax error
    expect(result).not.toContain('export default const');
    expect(result).not.toContain('export default function');
  });
});

describe('Assignment precedence in ternary', () => {
  it('parenthesizes assignment in @if with as alias', () => {
    const result = compile(
      `
      import { Component, signal } from '@angular/core';
      @Component({
        selector: 'app-detail',
        template: \`
          @if (data(); as item) {
            <p>{{ item.name }}</p>
          }
        \`
      })
      export class DetailComponent {
        data = signal<{name: string} | undefined>(undefined);
      }
    `,
      'detail.ts',
    );

    expectCompiles(result);
    // The assignment should be parenthesized: (tmp = ctx.data()) ? ...
    // NOT: tmp = ctx.data() ? ...
    expect(result).toMatch(/\(tmp_\d+_\d+ = ctx\.data\(\)\)/);
  });
});

describe('templateUrl inlining in metadata', () => {
  it('replaces templateUrl with template in setClassMetadata', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-ext',
        templateUrl: './test.component.html'
      })
      export class ExtComponent {}
    `,
      __dirname + '/__fixtures__/test.component.ts',
    );

    // The metadata should have template, not templateUrl
    const metaSection = result.code.substring(
      result.code.indexOf('ɵsetClassMetadata'),
    );
    expect(metaSection).not.toContain('templateUrl');
    expect(metaSection).toContain('template:');
  });
});

function expectCompiles(result: string) {
  expect(result).toBeTruthy();
  expect(result).not.toMatch(/^Error:/m);
}
