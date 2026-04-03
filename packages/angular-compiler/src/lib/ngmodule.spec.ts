import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';
import { expectCompiles, buildRegistry } from './test-helpers';

describe('@NgModule', () => {
  it('compiles a basic NgModule', () => {
    const result = compile(
      `
      import { NgModule, Component } from '@angular/core';

      @Component({ selector: 'app-child', template: '<span>child</span>' })
      export class ChildComponent {}

      @NgModule({
        declarations: [ChildComponent],
        exports: [ChildComponent],
        imports: []
      })
      export class ChildModule {}
    `,
      'child.module.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵmod');
    expect(result).toContain('ɵinj');
    expect(result).toContain('ɵfac');
  });

  it('compiles NgModule with providers', () => {
    const result = compile(
      `
      import { NgModule, Injectable } from '@angular/core';

      @Injectable()
      export class MyService {}

      @NgModule({
        providers: [MyService]
      })
      export class ServiceModule {}
    `,
      'service.module.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵmod');
    expect(result).toContain('ɵinj');
    expect(result).toContain('MyService');
  });

  it('resolves NgModule exports when imported by a component', () => {
    const childSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'mod-button', template: '<button>click</button>' })
      export class ModButtonComponent {}
    `;

    const moduleSrc = `
      import { NgModule } from '@angular/core';
      import { ModButtonComponent } from './mod-button';
      @NgModule({
        declarations: [ModButtonComponent],
        exports: [ModButtonComponent]
      })
      export class ButtonModule {}
    `;

    const appSrc = `
      import { Component } from '@angular/core';
      import { ButtonModule } from './button.module';
      @Component({
        selector: 'app-mod-test',
        template: '<mod-button></mod-button>',
        imports: [ButtonModule]
      })
      export class ModTestComponent {}
    `;

    const registry = buildRegistry({
      'mod-button.ts': childSrc,
      'button.module.ts': moduleSrc,
    });

    expect(registry.get('ButtonModule')?.kind).toBe('ngmodule');
    expect(registry.get('ButtonModule')?.exports).toContain(
      'ModButtonComponent',
    );
    expect(registry.get('ModButtonComponent')?.selector).toBe('mod-button');

    const result = compile(appSrc, 'app.ts', registry);

    expectCompiles(result);
    expect(result).toContain('ɵcmp');
    expect(result).not.toContain('ɵɵdomElement');
  });
});
