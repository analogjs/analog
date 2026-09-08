import { describe, it, expect, vi } from 'vitest';
import { parseSync } from 'oxc-parser';
import { componentHmrSignature, generateHmrCode } from './hmr';
import type { RegistryEntry } from './registry';

const source = `import { Component, inject } from '@angular/core';
import { Dependency } from './dependency';
@Component({ standalone: true, template: '<input>', styles: ['input { color: red }'] })
export class MyComponent {
  value = 1;
  dependency = inject(Dependency);
  constructor() { this.value = 2; }
  method() { return this.value; }
}`;
const signature = componentHmrSignature(source, 'my.ts');
const component: RegistryEntry = {
  className: 'MyComponent',
  selector: 'app-my',
  kind: 'component',
  fileName: 'my.ts',
};

function evaluate(declarations = [component], fingerprint = signature) {
  const generated = generateHmrCode(declarations, [], fingerprint);
  return new Function(
    'MyComponent',
    'i0',
    'meta',
    `${generated.replaceAll('export function', 'function').replaceAll('export const', 'const').replaceAll('import.meta', 'meta')}\nreturn { ɵhmr_MyComponent: typeof ɵhmr_MyComponent === 'function' ? ɵhmr_MyComponent : undefined, ɵhmrSignature };`,
  );
}

describe('fast component HMR qualification', () => {
  it.each([
    source.replace('<input>', '<input><span>updated</span>'),
    source.replace('color: red', 'color: blue'),
    source.replace("template: '<input>'", 'template: `new template`'),
  ])('accepts literal template/style edits', (updated) => {
    expect(signature).toBeTypeOf('string');
    expect(componentHmrSignature(updated, 'my.ts')).toBe(signature);
  });

  it('accepts a caller-owned parsed program', () => {
    const parsed = parseSync('my.ts', source);
    expect(componentHmrSignature(source, 'my.ts', parsed)).toBe(signature);
  });

  it('declines a caller-owned malformed parse', () => {
    const malformed = parseSync('my.ts', `${source}\n@Component(`);
    expect(malformed.errors.length).toBeGreaterThan(0);
    expect(componentHmrSignature(source, 'my.ts', malformed)).toBeUndefined();
  });

  it.each([
    source.replace('value = 1', 'value = 3'),
    source.replace('return this.value', 'return 42'),
    source.replace('this.value = 2', 'this.value = 4'),
    source.replace("'./dependency'", "'./other-dependency'"),
    source.replace(
      'inject(Dependency)',
      'inject(Dependency, { optional: true })',
    ),
    source.replace('standalone: true', 'standalone: false'),
    source.replace("template: '<input>'", 'template: dynamicTemplate'),
    source.replace(
      "template: '<input>'",
      'template: `value ${dynamicTemplate}`',
    ),
    source.replace('standalone: true', '...metadata'),
    source.replace('Component({', 'Directive({'),
    source.replace('Component({', 'Pipe({'),
    source + '\nconst changedDependency = 1;',
    source + '\n@Component(',
  ])('declines behavioral or ambiguous edits', (updated) => {
    expect(componentHmrSignature(updated, 'my.ts')).not.toBe(signature);
  });

  it('targets the live class through repeated metadata updates', () => {
    const replace = vi.fn();
    const callbacks: ((module: unknown) => void)[] = [];
    const hot = {
      data: {},
      accept: (callback: (typeof callbacks)[number]) =>
        callbacks.push(callback),
      invalidate: vi.fn(),
    };
    class LiveComponent {}
    class DonorComponent {}
    const initial = evaluate()(
      LiveComponent,
      { ɵɵreplaceMetadata: replace },
      { hot },
    );
    const updated = evaluate()(
      DonorComponent,
      { ɵɵreplaceMetadata: replace },
      { hot },
    );
    for (const callback of callbacks) callback(updated);
    expect(replace.mock.calls.map(([target]) => target)).toEqual([
      LiveComponent,
      LiveComponent,
    ]);
    expect(initial.ɵhmrSignature).toBe(updated.ɵhmrSignature);
    expect(hot.invalidate).not.toHaveBeenCalled();
  });

  it('reloads behavioral edits before applying donor metadata', () => {
    let accept: (module: unknown) => void = () => {};
    const hot = {
      data: {},
      accept: (callback: typeof accept) => {
        accept = callback;
      },
      invalidate: vi.fn(),
    };
    const replace = vi.fn();
    evaluate()(class {}, { ɵɵreplaceMetadata: replace }, { hot });
    const donor = vi.fn();
    accept({ ɵhmrSignature: 'changed', ɵhmr_MyComponent: donor });
    expect(hot.invalidate).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    expect(donor).not.toHaveBeenCalled();
  });

  it.each(['directive', 'pipe'] as const)(
    'reloads %s edits without mutating definitions',
    (kind) => {
      let accept: (module: unknown) => void = () => {};
      const hot = {
        data: {},
        accept: (callback: typeof accept) => {
          accept = callback;
        },
        invalidate: vi.fn(),
      };
      const replace = vi.fn();
      evaluate([{ ...component, kind }])(
        class {},
        { ɵɵreplaceMetadata: replace },
        { hot },
      );
      const donor = vi.fn();
      accept({ ɵhmrSignature: signature, ɵhmr_MyComponent: donor });
      expect(hot.invalidate).toHaveBeenCalledOnce();
      expect(replace).not.toHaveBeenCalled();
      expect(donor).not.toHaveBeenCalled();
    },
  );

  it('keeps recreated instances attached to the original class', () => {
    class LiveComponent {
      static ɵcmp: { type: unknown; revision: number };
      static ɵfac: (target?: typeof LiveComponent) => LiveComponent;
    }
    for (const revision of [1, 2, 3]) {
      class DonorComponent {
        static ɵcmp = { type: DonorComponent, revision };
        static ɵfac = (target = DonorComponent) => new target();
      }
      evaluate()(DonorComponent, {}, {}).ɵhmr_MyComponent(LiveComponent);
      expect(LiveComponent.ɵcmp.type).toBe(LiveComponent);
      expect(LiveComponent.ɵcmp.revision).toBe(revision);
      expect(LiveComponent.ɵfac()).toBeInstanceOf(LiveComponent);
    }
  });
});
