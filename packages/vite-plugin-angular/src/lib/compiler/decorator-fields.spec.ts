import { describe, it, expect } from 'vitest';
import { compileCode as compile, expectCompiles } from './test-helpers';

describe('Field Decorators', () => {
  describe('@Input', () => {
    it('detects @Input() on property', () => {
      const result = compile(
        `
        import { Component, Input } from '@angular/core';
        @Component({ selector: 'x', template: '{{ name }}' })
        export class X { @Input() name: string = ''; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('"name"');
    });

    it('detects @Input with alias', () => {
      const result = compile(
        `
        import { Component, Input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Input('myAlias') name: string = ''; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('myAlias');
    });

    it('detects @Input with required', () => {
      const result = compile(
        `
        import { Component, Input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Input({ required: true }) name: string = ''; }
      `,
        'test.ts',
      );

      expectCompiles(result);
    });

    it('detects @Input with transform', () => {
      const result = compile(
        `
        import { Component, Input, numberAttribute } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Input({ transform: numberAttribute }) count: number = 0; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      // Transform function produces InputFlags with transform bit (2)
      expect(result).toContain('numberAttribute');
    });
  });

  describe('@Output', () => {
    it('detects @Output() on property', () => {
      const result = compile(
        `
        import { Component, Output, EventEmitter } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Output() clicked = new EventEmitter(); }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('clicked');
    });

    it('detects @Output with alias', () => {
      const result = compile(
        `
        import { Component, Output, EventEmitter } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Output('myEvent') clicked = new EventEmitter(); }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('myEvent');
    });
  });

  describe('@ViewChild / @ContentChild', () => {
    it('detects @ViewChild with string predicate', () => {
      const result = compile(
        `
        import { Component, ViewChild, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<input #myRef />' })
        export class X { @ViewChild('myRef') myRef!: ElementRef; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵviewQuery');
    });

    it('detects @ViewChildren', () => {
      const result = compile(
        `
        import { Component, ViewChildren, QueryList, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<div #item></div>' })
        export class X { @ViewChildren('item') items!: QueryList<ElementRef>; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵviewQuery');
    });

    it('detects @ContentChild with string predicate', () => {
      const result = compile(
        `
        import { Component, ContentChild, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<ng-content></ng-content>' })
        export class X { @ContentChild('header') header!: ElementRef; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵcontentQuery');
    });

    it('detects @ContentChildren', () => {
      const result = compile(
        `
        import { Component, ContentChildren, QueryList, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<ng-content></ng-content>' })
        export class X { @ContentChildren('panel') panels!: QueryList<ElementRef>; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵcontentQuery');
    });

    it('detects @ViewChild with static option', () => {
      const result = compile(
        `
        import { Component, ViewChild, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<input #ref />' })
        export class X { @ViewChild('ref', { static: true }) ref!: ElementRef; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵviewQuery');
    });
  });

  describe('@HostBinding / @HostListener', () => {
    it('detects @HostBinding on property', () => {
      const result = compile(
        `
        import { Directive, HostBinding } from '@angular/core';
        @Directive({ selector: '[appActive]' })
        export class ActiveDirective { @HostBinding('class.active') isActive = true; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵdir');
      expect(result).toContain('active');
    });

    it('detects @HostListener on method', () => {
      const result = compile(
        `
        import { Directive, HostListener } from '@angular/core';
        @Directive({ selector: '[appClick]' })
        export class ClickDirective {
          @HostListener('click') onClick() {}
        }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵdir');
      expect(result).toContain('click');
    });

    it('detects @HostListener with args', () => {
      const result = compile(
        `
        import { Directive, HostListener } from '@angular/core';
        @Directive({ selector: '[appKey]' })
        export class KeyDirective {
          @HostListener('keydown', ['$event']) onKey(event: KeyboardEvent) {}
        }
      `,
        'test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('keydown');
    });

    it('merges @HostBinding with host config', () => {
      const result = compile(
        `
        import { Component, HostBinding } from '@angular/core';
        @Component({
          selector: 'x',
          template: '',
          host: { '[class.base]': 'true' }
        })
        export class X { @HostBinding('class.extra') isExtra = true; }
      `,
        'test.ts',
      );

      expectCompiles(result);
      // Both host config and decorator bindings should be present
      expect(result).toContain('base');
      expect(result).toContain('extra');
    });
  });
});
