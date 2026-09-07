import { describe, it, expect, vi } from 'vitest';
import { generateHmrCode } from './hmr';

describe('HMR code generation', () => {
  it('generates dynamic field copying for components', () => {
    const code = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'my.ts',
      },
    ]);

    // Should use dynamic field copying instead of hardcoded ɵcmp/ɵfac
    expect(code).toContain('Object.getOwnPropertyNames(MyComponent)');
    expect(code).toContain("key.startsWith('ɵ')");
    expect(code).not.toContain('type.ɵcmp = ');
    expect(code).not.toContain('type.ɵfac = ');
  });

  it('generates ɵɵreplaceMetadata call for components', () => {
    const code = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'my.ts',
      },
    ]);

    expect(code).toContain('ɵɵreplaceMetadata');
    expect(code).toContain('newModule.ɵhmr_MyComponent');
    expect(code).toContain('import.meta.hot.accept');
  });

  it('generates invalidation for directives instead of ɵɵreplaceMetadata', () => {
    const code = generateHmrCode([
      {
        className: 'HighlightDirective',
        selector: '[appHighlight]',
        kind: 'directive',
        fileName: 'highlight.ts',
      },
    ]);

    // Directives should get field swap + invalidate, not ɵɵreplaceMetadata call
    expect(code).toContain('ɵhmr_HighlightDirective');
    expect(code).not.toContain('i0.ɵɵreplaceMetadata(');
    expect(code).toContain(
      "import.meta.hot.invalidate('Directive/pipe changed, reloading')",
    );
  });

  it('generates invalidation for pipes instead of ɵɵreplaceMetadata', () => {
    const code = generateHmrCode([
      {
        className: 'TruncatePipe',
        selector: 'truncate',
        kind: 'pipe',
        pipeName: 'truncate',
        fileName: 'truncate.ts',
      },
    ]);

    expect(code).toContain('ɵhmr_TruncatePipe');
    expect(code).not.toContain('i0.ɵɵreplaceMetadata(');
    expect(code).toContain(
      "import.meta.hot.invalidate('Directive/pipe changed, reloading')",
    );
  });

  it('handles mixed components and directives in one file', () => {
    const code = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'shared.ts',
      },
      {
        className: 'MyDirective',
        selector: '[appMy]',
        kind: 'directive',
        fileName: 'shared.ts',
      },
    ]);

    // Should have both ɵɵreplaceMetadata for component and invalidate for directive
    expect(code).toContain('ɵɵreplaceMetadata');
    expect(code).toContain('newModule.ɵhmr_MyComponent');
    expect(code).toContain(
      "newModule.ɵhmr_MyDirective(ɵhmrClasses.get('MyDirective'))",
    );
    expect(code).toContain(
      "import.meta.hot.invalidate('Directive/pipe changed, reloading')",
    );
    // Both should get applyMetadata functions
    expect(code).toContain('ɵhmr_MyComponent(type)');
    expect(code).toContain('ɵhmr_MyDirective(type)');
  });

  it('passes local dependencies to ɵɵreplaceMetadata', () => {
    const code = generateHmrCode(
      [
        {
          className: 'ParentComponent',
          selector: 'app-parent',
          kind: 'component',
          fileName: 'parent.ts',
        },
      ],
      ['ParentComponent', 'ChildComponent'],
    );

    expect(code).toContain('[ParentComponent, ChildComponent]');
  });

  it('passes empty local deps array by default', () => {
    const code = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'my.ts',
      },
    ]);

    // Default: no local deps
    expect(code).toContain("ɵhmrClasses.get('MyComponent')");
    expect(code).toContain('          [],');
  });

  it('targets the live class across successive module evaluations', () => {
    const generated = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'my.ts',
      },
    ]);
    const evaluate = new Function(
      'MyComponent',
      'i0',
      'meta',
      generated
        .replaceAll('export function', 'function')
        .replaceAll('import.meta', 'meta'),
    );
    const replace = vi.fn();
    const callbacks: ((module: {
      ɵhmr_MyComponent: (type: object) => void;
    }) => void)[] = [];
    const hot = {
      data: {},
      accept: (callback: (typeof callbacks)[number]) =>
        callbacks.push(callback),
      invalidate: vi.fn(),
    };
    class LiveComponent {}
    class NewModuleComponent {}
    evaluate(LiveComponent, { ɵɵreplaceMetadata: replace }, { hot });
    evaluate(NewModuleComponent, { ɵɵreplaceMetadata: replace }, { hot });
    for (const callback of callbacks) callback({ ɵhmr_MyComponent: () => {} });
    expect(replace.mock.calls.map(([target]) => target)).toEqual([
      LiveComponent,
      LiveComponent,
    ]);
    expect(hot.invalidate).not.toHaveBeenCalled();
  });
});
