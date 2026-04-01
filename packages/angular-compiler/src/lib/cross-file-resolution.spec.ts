import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';
import { expectCompiles, buildRegistry } from './test-helpers';

describe('Global Analysis (cross-file resolution)', () => {
  describe('Component References', () => {
    it('resolves component selector via registry', () => {
      const buttonSrc = `
        import { Component } from '@angular/core';
        @Component({
          selector: 'ui-button',
          template: '<button><ng-content></ng-content></button>'
        })
        export class ButtonComponent {}
      `;

      const toolbarSrc = `
        import { Component } from '@angular/core';
        import { ButtonComponent } from './button';
        @Component({
          selector: 'app-toolbar',
          template: '<ui-button>Save</ui-button><ui-button>Cancel</ui-button>',
          imports: [ButtonComponent]
        })
        export class ToolbarComponent {}
      `;

      const registry = buildRegistry({ 'button.ts': buttonSrc });

      expect(registry.get('ButtonComponent')?.selector).toBe('ui-button');

      const result = compile(toolbarSrc, 'toolbar.ts', registry);

      expectCompiles(result);
      expect(result).toContain('ɵcmp');
      expect(result).not.toContain('ɵɵdomElement');
    });

    it('compiles property and event bindings with registry', () => {
      const childSrc = `
        import { Component, input, output } from '@angular/core';
        @Component({ selector: 'child-cmp', template: '<span>{{ title() }}</span>' })
        export class ChildComponent {
          title = input('');
          save = output<string>();
        }
      `;

      const parentSrc = `
        import { Component, signal } from '@angular/core';
        import { ChildComponent } from './child';
        @Component({
          selector: 'app-parent',
          template: '<child-cmp [title]="myTitle()" (save)="onSave($event)"></child-cmp>',
          imports: [ChildComponent]
        })
        export class ParentComponent {
          myTitle = signal('Hello');
          onSave(val: string) {}
        }
      `;

      const registry = buildRegistry({ 'child.ts': childSrc });
      const result = compile(parentSrc, 'parent.ts', registry);

      expectCompiles(result);
      expect(result).toContain('ɵɵproperty');
      expect(result).not.toContain('ɵɵdomProperty');
    });

    it('compiles two-way binding syntax', () => {
      const childSrc = `
        import { Component, model } from '@angular/core';
        @Component({ selector: 'app-slider', template: '<input />' })
        export class SliderComponent {
          value = model(0);
        }
      `;

      const parentSrc = `
        import { Component, signal } from '@angular/core';
        import { SliderComponent } from './slider';
        @Component({
          selector: 'app-two-way',
          template: '<app-slider [(value)]="current"></app-slider>',
          imports: [SliderComponent]
        })
        export class TwoWayComponent {
          current = signal(50);
        }
      `;

      const registry = buildRegistry({ 'slider.ts': childSrc });
      const result = compile(parentSrc, 'two-way.ts', registry);

      expectCompiles(result);
      expect(result).toContain('ɵcmp');
    });
  });

  describe('Pipe References', () => {
    it('resolves pipe via registry', () => {
      const pipeSrc = `
        import { Pipe } from '@angular/core';
        @Pipe({ name: 'shout' })
        export class ShoutPipe {
          transform(v: string) { return v.toUpperCase() + '!'; }
        }
      `;

      const componentSrc = `
        import { Component, signal } from '@angular/core';
        import { ShoutPipe } from './shout.pipe';
        @Component({
          selector: 'app-greeting',
          template: '{{ name() | shout }}',
          imports: [ShoutPipe]
        })
        export class GreetingComponent {
          name = signal('hello');
        }
      `;

      const registry = buildRegistry({ 'shout.pipe.ts': pipeSrc });

      expect(registry.get('ShoutPipe')?.kind).toBe('pipe');
      expect(registry.get('ShoutPipe')?.pipeName).toBe('shout');

      const result = compile(componentSrc, 'greeting.ts', registry);

      expectCompiles(result);
      expect(result).toContain('ɵcmp');
      expect(result).toContain('ShoutPipe');
    });
  });

  describe('Directive References', () => {
    it('resolves directive via registry', () => {
      const directiveSrc = `
        import { Directive, input } from '@angular/core';
        @Directive({
          selector: '[appTooltip]',
          host: { '(mouseenter)': 'show()', '(mouseleave)': 'hide()' }
        })
        export class TooltipDirective {
          text = input.required<string>();
          show() {}
          hide() {}
        }
      `;

      const componentSrc = `
        import { Component, signal } from '@angular/core';
        import { TooltipDirective } from './tooltip.directive';
        @Component({
          selector: 'app-icon',
          template: '<span appTooltip [text]="tip()">icon</span>',
          imports: [TooltipDirective]
        })
        export class IconComponent {
          tip = signal('Info');
        }
      `;

      const registry = buildRegistry({ 'tooltip.directive.ts': directiveSrc });

      expect(registry.get('TooltipDirective')?.selector).toBe('[appTooltip]');
      expect(registry.get('TooltipDirective')?.kind).toBe('directive');

      const result = compile(componentSrc, 'icon.ts', registry);

      expectCompiles(result);
      expect(result).toContain('ɵcmp');
      expect(result).toContain('TooltipDirective');
    });
  });
});
