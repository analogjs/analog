import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';
import { expectCompiles } from './test-helpers';

describe('@Directive', () => {
  it('compiles directive with host bindings and listeners', () => {
    const result = compile(
      `
      import { Component, Directive, input, output, signal } from '@angular/core';
      @Directive({
        selector: '[appHighlight]',
        host: {
          '(mouseenter)': 'onEnter()',
          '(mouseleave)': 'onLeave()',
          '[style.backgroundColor]': 'bgColor()',
          '[class.active]': 'isActive()'
        }
      })
      export class HighlightDirective {
        color = input('yellow');
        highlighted = output<boolean>();
        bgColor = signal('');
        isActive = signal(false);
        onEnter() {}
        onLeave() {}
      }
    `,
      'highlight.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵdir');
    expect(result).toContain('ɵfac');
    expect(result).toContain('appHighlight');
    // Decorator stripped
    expect(result).not.toContain('@Directive');
    // Host listeners emitted
    expect(result).toContain('ɵɵlistener');
    expect(result).toContain('mouseenter');
    expect(result).toContain('mouseleave');
    // Host style/class bindings emitted
    expect(result).toContain('ɵɵstyleProp');
    expect(result).toContain('ɵɵclassProp');
  });

  it('compiles directive with exportAs', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive({
        selector: '[appDraggable]',
        exportAs: 'draggable'
      })
      export class DraggableDirective {}
    `,
      'draggable.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵdir');
    expect(result).toContain('draggable');
  });
});

describe('Directive compilation', () => {
  it('compiles a directive with host bindings', () => {
    const result = compile(
      `
      import { Directive, HostBinding, HostListener } from '@angular/core';
      @Directive({
        selector: '[appHighlight]',
        standalone: true
      })
      export class HighlightDirective {
        @HostBinding('class.active') isActive = false;
        @HostListener('click') onClick() { this.isActive = !this.isActive; }
      }
    `,
      'highlight.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefineDirective');
    expect(result).toContain('"appHighlight"');
    expect(result).toContain('isActive');
  });

  it('compiles a directive with signal inputs', () => {
    const result = compile(
      `
      import { Directive, input } from '@angular/core';
      @Directive({
        selector: '[appTooltip]',
        standalone: true
      })
      export class TooltipDirective {
        text = input.required<string>();
        position = input<'top' | 'bottom'>('top');
      }
    `,
      'tooltip.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefineDirective');
    expect(result).toContain('"appTooltip"');
    // Signal inputs should have the proper flags. Angular v17 emits the
    // symbolic `i0.ɵɵInputFlags.SignalBased`; v18+ emits the literal `1`.
    expect(result).toMatch(
      /inputs:.*text.*\[(?:1|i0\.ɵɵInputFlags\.SignalBased)/,
    );
  });

  it('compiles a directive with exportAs', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive({
        selector: '[appDraggable]',
        exportAs: 'draggable',
        standalone: true
      })
      export class DraggableDirective {}
    `,
      'draggable.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefineDirective');
    expect(result).toContain('"draggable"');
  });
});

describe('Abstract directive with no selector compiles', () => {
  it('compiles `@Directive()` (no selector) without crashing', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive()
      export abstract class BaseDir {}
    `,
      'b.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵdir');
  });
});

describe('Directive providers wrapped as LiteralArrayExpr', () => {
  it('compiles directive providers without crashing at runtime', () => {
    const result = compile(
      `
      import { Directive, InjectionToken } from '@angular/core';
      const TOKEN = new InjectionToken<string>('t');
      @Directive({
        selector: '[d]',
        providers: [{ provide: TOKEN, useValue: 'x' }],
      })
      export class D {}
    `,
      'd.ts',
    );
    expectCompiles(result);
    // Providers should be emitted as a feature
    expect(result).toContain('ProvidersFeature');
  });

  it('omits providers feature when directive has no providers', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[d]' })
      export class D {}
    `,
      'd.ts',
    );
    expectCompiles(result);
    expect(result).not.toContain('ProvidersFeature');
  });
});
