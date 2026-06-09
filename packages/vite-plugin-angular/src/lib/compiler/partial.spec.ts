import { describe, it, expect } from 'vitest';
import {
  compilePartialCode as compilePartial,
  compileCode,
} from './test-helpers';
import { expectCompiles } from './test-helpers';

describe('Partial Compilation (Library Mode)', () => {
  describe('@Component', () => {
    it('emits ɵɵngDeclareComponent instead of ɵɵdefineComponent', () => {
      const result = compilePartial(
        `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-hello', template: '<h1>Hello</h1>' })
        export class HelloComponent {}
      `,
        'hello.component.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵngDeclareComponent');
      expect(result).not.toContain('ɵɵdefineComponent');
      expect(result).toContain('ɵfac');
      // Partial output should include the raw template string
      expect(result).toContain('<h1>Hello</h1>');
    });

    it('emits ɵɵngDeclareFactory for component', () => {
      const result = compilePartial(
        `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-test', template: '' })
        export class TestComponent {}
      `,
        'test.component.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵngDeclareFactory');
      expect(result).not.toContain('ɵɵdefineComponent');
    });

    it('preserves inputs and outputs in partial output', () => {
      const result = compilePartial(
        `
        import { Component, input, output } from '@angular/core';
        @Component({ selector: 'app-io', template: '' })
        export class IoComponent {
          name = input<string>();
          clicked = output();
        }
      `,
        'io.component.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵngDeclareComponent');
      expect(result).toContain('name');
      expect(result).toContain('clicked');
    });
  });

  describe('@Directive', () => {
    it('emits ɵɵngDeclareDirective instead of ɵɵdefineDirective', () => {
      const result = compilePartial(
        `
        import { Directive } from '@angular/core';
        @Directive({ selector: '[appHighlight]' })
        export class HighlightDirective {}
      `,
        'highlight.directive.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵngDeclareDirective');
      expect(result).not.toContain('ɵɵdefineDirective');
      expect(result).toContain('ɵfac');
    });
  });

  describe('@Pipe', () => {
    it('emits ɵɵngDeclarePipe instead of ɵɵdefinePipe', () => {
      const result = compilePartial(
        `
        import { Pipe } from '@angular/core';
        @Pipe({ name: 'truncate' })
        export class TruncatePipe {
          transform(value: string): string { return value; }
        }
      `,
        'truncate.pipe.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵngDeclarePipe');
      expect(result).not.toContain('ɵɵdefinePipe');
      expect(result).toContain('truncate');
    });
  });

  describe('@Injectable', () => {
    it('emits ɵɵngDeclareInjectable instead of ɵɵdefineInjectable', () => {
      const result = compilePartial(
        `
        import { Injectable } from '@angular/core';
        @Injectable({ providedIn: 'root' })
        export class DataService {}
      `,
        'data.service.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵngDeclareInjectable');
      expect(result).not.toContain('ɵɵdefineInjectable');
      expect(result).toContain('ɵfac');
    });
  });

  describe('@NgModule', () => {
    it('emits ɵɵngDeclareNgModule and ɵɵngDeclareInjector', () => {
      const result = compilePartial(
        `
        import { NgModule } from '@angular/core';
        @NgModule({
          imports: [],
          exports: [],
        })
        export class SharedModule {}
      `,
        'shared.module.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵngDeclareNgModule');
      expect(result).toContain('ɵɵngDeclareInjector');
      expect(result).not.toContain('ɵɵdefineNgModule');
      expect(result).toContain('ɵfac');
    });
  });

  describe('class metadata', () => {
    it('emits ɵɵngDeclareClassMetadata instead of setClassMetadata', () => {
      const result = compilePartial(
        `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-meta', template: '' })
        export class MetaComponent {}
      `,
        'meta.component.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵngDeclareClassMetadata');
      expect(result).not.toContain('setClassMetadata');
    });
  });

  describe('signal API metadata', () => {
    it('emits isRequired: true for input.required() and false for input()', () => {
      const result = compilePartial(
        `
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          a = input<string>();
          b = input.required<number>();
        }
      `,
        'inputs.ts',
      );

      expect(result).toMatch(/a:\s*\{[^}]*isRequired:\s*false/);
      expect(result).toMatch(/b:\s*\{[^}]*isRequired:\s*true/);
    });

    it('emits transformFunction: null for input() — signal applies it internally', () => {
      // Forwarding the user's transform to the directive metadata makes
      // Angular's runtime apply it a second time on top of the signal's
      // own internal application.
      const result = compilePartial(
        `
        import { Component, input, numberAttribute } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { size = input(0, { transform: numberAttribute }); }
      `,
        'transform.ts',
      );

      expect(result).toMatch(/size:\s*\{[^}]*transformFunction:\s*null/);
      expect(result).not.toMatch(
        /size:\s*\{[^}]*transformFunction:\s*numberAttribute/,
      );
    });

    it('emits isRequired: true for model.required() and false for model()', () => {
      // Without propagating required through the model branch, the
      // template type-checker silently accepts unbound required models —
      // the consumer only discovers the bug at runtime when the signal
      // is first read.
      const result = compilePartial(
        `
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          c = model<string>();
          d = model.required<number>();
        }
      `,
        'models.ts',
      );

      expect(result).toMatch(/c:\s*\{[^}]*isRequired:\s*false/);
      expect(result).toMatch(/d:\s*\{[^}]*isRequired:\s*true/);
    });
  });

  describe('full mode unchanged', () => {
    it('still emits ɵɵdefineComponent in full mode', () => {
      // Verify that full mode (default) is unaffected
      const result = compileCode(
        `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-full', template: '' })
        export class FullComponent {}
      `,
        'full.component.ts',
      );

      expect(result).toContain('ɵɵdefineComponent');
      expect(result).not.toContain('ɵɵngDeclareComponent');
    });
  });
});
