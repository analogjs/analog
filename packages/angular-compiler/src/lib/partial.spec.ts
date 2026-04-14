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
