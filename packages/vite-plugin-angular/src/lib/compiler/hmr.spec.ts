import { describe, it, expect } from 'vitest';
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
    expect(code).toContain('newModule.ɵhmr_MyDirective(MyDirective)');
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
    expect(code).toMatch(/ɵɵreplaceMetadata\(\s*MyComponent[\s\S]*?\[\],/);
  });
});
