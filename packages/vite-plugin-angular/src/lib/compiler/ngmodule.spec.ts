import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';
import { expectCompiles, buildRegistry } from './test-helpers';
import { ANGULAR_MAJOR } from './angular-version';

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

  it('emits providers referenced by a const identifier instead of an inline array', () => {
    // `providers: <identifier>` (a module-level const array, common with
    // helpers like Bitwarden's `safeProvider(...)` collected into a
    // `safeProviders` const) must be passed through to `ɵɵdefineInjector`
    // by reference. fastCompile does no static evaluation, so it cannot
    // expand the identifier the way ngtsc does — but Angular flattens the
    // expression at runtime. Previously the non-array value was dropped,
    // emitting `ɵɵdefineInjector({})` and failing every provided token with
    // NG0201 at runtime.
    const result = compile(
      `
      import { NgModule, Injectable } from '@angular/core';

      @Injectable()
      export class MyService {}

      const providers = [MyService];

      @NgModule({
        providers,
      })
      export class ServiceModule {}
    `,
      'ref-service.module.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵinj');
    // The injector definition must reference the const, not be emitted empty.
    expect(result).toMatch(/ɵɵdefineInjector\(\{\s*providers\b/);
    expect(result).not.toMatch(/ɵɵdefineInjector\(\{\s*\}\)/);
  });

  it('emits component providers referenced by a const identifier', () => {
    const result = compile(
      `
      import { Component, Injectable } from '@angular/core';

      @Injectable()
      export class PanelService {}

      const PANEL_PROVIDERS = [PanelService];

      @Component({
        selector: 'app-panel',
        template: '<span>panel</span>',
        providers: PANEL_PROVIDERS,
      })
      export class PanelComponent {}
    `,
      'panel.component.ts',
    );

    expectCompiles(result);
    // ɵɵProvidersFeature must receive the referenced const, not null.
    expect(result).toContain('ɵɵProvidersFeature');
    expect(result).toContain('PANEL_PROVIDERS');
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

describe('NgModule export expansion', () => {
  it('resolves NgModule exports into individual declarations', () => {
    const buttonSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'ui-button', template: '<button><ng-content /></button>' })
      export class ButtonComponent {}
    `;
    const moduleSrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ declarations: [ButtonComponent], exports: [ButtonComponent] })
      export class SharedModule {}
    `;
    const appSrc = `
      import { Component } from '@angular/core';
      import { SharedModule } from './shared.module';
      @Component({
        selector: 'app-root',
        imports: [SharedModule],
        template: '<ui-button>Click</ui-button>'
      })
      export class AppComponent {}
    `;

    const registry = buildRegistry({
      'button.ts': buttonSrc,
      'shared.module.ts': moduleSrc,
    });
    const result = compile(appSrc, 'app.ts', registry);

    expectCompiles(result);
    // The template should resolve ui-button from the NgModule exports
    expect(result).toContain('"ui-button"');
  });

  it('imports an expanded NgModule export from its defining file, not the module file', () => {
    // Component lives in its own file; the NgModule only re-exports it.
    const buttonSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'ui-button', template: '<button><ng-content /></button>' })
      export class ButtonComponent {}
    `;
    const moduleSrc = `
      import { NgModule } from '@angular/core';
      import { ButtonComponent } from './button.component';
      @NgModule({ declarations: [ButtonComponent], exports: [ButtonComponent] })
      export class SharedModule {}
    `;
    const appSrc = `
      import { Component } from '@angular/core';
      import { SharedModule } from './shared.module';
      @Component({
        selector: 'app-root',
        imports: [SharedModule],
        template: '<ui-button>Click</ui-button>'
      })
      export class AppComponent {}
    `;

    const registry = buildRegistry({
      'button.component.ts': buttonSrc,
      'shared.module.ts': moduleSrc,
    });
    const result = compile(appSrc, 'app.ts', registry);

    expectCompiles(result);
    // The synthetic import must point at the component's own file...
    expect(result).toContain(
      'import { ButtonComponent } from "./button.component"',
    );
    // ...not the NgModule file, which doesn't export the component.
    expect(result).not.toContain(
      'import { ButtonComponent } from "./shared.module"',
    );
  });
});

describe('Recursive NgModule export expansion', () => {
  it('expands nested NgModule exports into declarations', () => {
    // Simulates ReactiveFormsModule → SharedModule → DefaultValueAccessor
    const valueAccessorSrc = `
      import { Directive } from '@angular/core';
      @Directive({ selector: 'input[type=text]' })
      export class TextValueAccessor {}
    `;
    const sharedModuleSrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ exports: [TextValueAccessor] })
      export class SharedFormsModule {}
    `;
    const formsModuleSrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ exports: [SharedFormsModule, FormControlDirective] })
      export class MyFormsModule {}
    `;
    const controlSrc = `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[formControl]' })
      export class FormControlDirective {}
    `;
    const appSrc = `
      import { Component } from '@angular/core';
      import { MyFormsModule } from './forms.module';
      @Component({
        selector: 'app-form',
        imports: [MyFormsModule],
        template: '<input type="text" formControl />'
      })
      export class FormComponent {}
    `;

    const registry = buildRegistry({
      'value-accessor.ts': valueAccessorSrc,
      'shared.module.ts': sharedModuleSrc,
      'forms.module.ts': formsModuleSrc,
      'control.ts': controlSrc,
    });
    const result = compile(appSrc, 'form.ts', registry);

    expectCompiles(result);
    // Both the direct export and nested module export should be resolved
    expect(result).toContain('FormControlDirective');
    expect(result).toContain('TextValueAccessor');
  });

  it('handles circular NgModule exports without infinite loop', () => {
    const modASrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ exports: [ModuleB, CompA] })
      export class ModuleA {}
    `;
    const modBSrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ exports: [ModuleA, CompB] })
      export class ModuleB {}
    `;
    const compASrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'comp-a', template: '' })
      export class CompA {}
    `;
    const compBSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'comp-b', template: '' })
      export class CompB {}
    `;
    const appSrc = `
      import { Component } from '@angular/core';
      import { ModuleA } from './mod-a';
      @Component({
        selector: 'app-root',
        imports: [ModuleA],
        template: '<comp-a /><comp-b />'
      })
      export class AppComponent {}
    `;

    const registry = buildRegistry({
      'mod-a.ts': modASrc,
      'mod-b.ts': modBSrc,
      'comp-a.ts': compASrc,
      'comp-b.ts': compBSrc,
    });

    // Should not hang or throw
    const result = compile(appSrc, 'app.ts', registry);
    expectCompiles(result);
    expect(result).toContain('CompA');
    expect(result).toContain('CompB');
  });
});

describe('Dependency list deduplication', () => {
  // Extract the contents of `dependencies: () => [ … ]` from compiled
  // output so individual class references can be counted.
  function depsArrayFor(result: string): string {
    const m = result.match(/dependencies:\s*\(\)\s*=>\s*\[([\s\S]*?)\]/);
    expect(m).not.toBeNull();
    return m![1];
  }
  function countRefs(deps: string, name: string): number {
    return (deps.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length;
  }

  it('dedupes a class imported both directly and via a tuple barrel', () => {
    const registry = buildRegistry({
      'icon.ts': `
        import { Component } from '@angular/core';
        @Component({ selector: 'ng-icon', template: '' })
        export class NgIcon {}
      `,
      'hlm-icon.ts': `
        import { Component } from '@angular/core';
        @Component({ selector: 'hlm-icon', template: '' })
        export class HlmIcon {}
      `,
      'barrel.ts': `
        import { HlmIcon } from './hlm-icon';
        import { NgIcon } from './icon';
        export const HlmIconImports = [HlmIcon, NgIcon] as const;
      `,
    });
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { NgIcon } from './icon';
      import { HlmIconImports } from './barrel';
      @Component({
        selector: 'app-root',
        imports: [NgIcon, HlmIconImports],
        template: '<hlm-icon><ng-icon /></hlm-icon>',
      })
      export class App {}
    `,
      'app.ts',
      registry,
    );
    expectCompiles(result);
    const deps = depsArrayFor(result);
    expect(countRefs(deps, 'NgIcon')).toBe(1);
    expect(countRefs(deps, 'HlmIcon')).toBe(1);
  });

  it('dedupes a directive re-exported by two NgModules', () => {
    const registry = buildRegistry({
      'value-accessor.ts': `
        import { Directive } from '@angular/core';
        @Directive({ selector: 'input[ngModel]' })
        export class DefaultValueAccessor {}
      `,
      'forms.module.ts': `
        import { NgModule } from '@angular/core';
        import { DefaultValueAccessor } from './value-accessor';
        @NgModule({ exports: [DefaultValueAccessor] })
        export class FormsModule {}
      `,
      'reactive-forms.module.ts': `
        import { NgModule } from '@angular/core';
        import { DefaultValueAccessor } from './value-accessor';
        @NgModule({ exports: [DefaultValueAccessor] })
        export class ReactiveFormsModule {}
      `,
    });
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { FormsModule } from './forms.module';
      import { ReactiveFormsModule } from './reactive-forms.module';
      @Component({
        selector: 'app-form',
        imports: [FormsModule, ReactiveFormsModule],
        template: '<input ngModel />',
      })
      export class FormApp {}
    `,
      'form-app.ts',
      registry,
    );
    expectCompiles(result);
    const deps = depsArrayFor(result);
    expect(countRefs(deps, 'DefaultValueAccessor')).toBe(1);
  });

  it('does not duplicate the self reference when a tuple barrel includes the component itself', () => {
    const registry = buildRegistry({
      'self.ts': `
        import { Component } from '@angular/core';
        @Component({ selector: 'self-cmp', template: '<self-cmp />' })
        export class SelfCmp {}
        export const SelfBarrel = [SelfCmp] as const;
      `,
    });
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { SelfBarrel } from './self';
      @Component({
        selector: 'self-cmp',
        imports: [SelfBarrel],
        template: '<self-cmp />',
      })
      export class SelfCmp {}
    `,
      'self.ts',
      registry,
    );
    expectCompiles(result);
    const deps = depsArrayFor(result);
    expect(countRefs(deps, 'SelfCmp')).toBe(1);
  });
});

describe('NgModule scope for declared (non-standalone) components', () => {
  function depsArrayFor(result: string): string {
    const m = result.match(/dependencies:\s*\(\)\s*=>\s*\[([\s\S]*?)\]/);
    expect(
      m,
      'compiled output should contain a dependencies array',
    ).not.toBeNull();
    return m![1];
  }

  it("inlines the declaring module's own declarations and transitive imported-module exports into a non-standalone component", () => {
    const componentSrc = `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-panel',
        standalone: false,
        template: '<div highlight shared>x</div>',
      })
      export class PanelComponent {}
    `;
    const highlightSrc = `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[highlight]', standalone: false })
      export class HighlightDirective {}
    `;
    const sharedDirectiveSrc = `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[shared]' })
      export class SharedDirective {}
    `;
    const sharedModuleSrc = `
      import { NgModule } from '@angular/core';
      import { SharedDirective } from './shared.directive';
      @NgModule({ declarations: [SharedDirective], exports: [SharedDirective] })
      export class SharedModule {}
    `;
    const moduleSrc = `
      import { NgModule } from '@angular/core';
      import { PanelComponent } from './panel.component';
      import { HighlightDirective } from './highlight.directive';
      import { SharedModule } from './shared.module';
      @NgModule({
        declarations: [PanelComponent, HighlightDirective],
        imports: [SharedModule],
      })
      export class PanelModule {}
    `;

    const registry = buildRegistry({
      'panel.component.ts': componentSrc,
      'highlight.directive.ts': highlightSrc,
      'shared.directive.ts': sharedDirectiveSrc,
      'shared.module.ts': sharedModuleSrc,
      'panel.module.ts': moduleSrc,
    });

    const result = compile(componentSrc, 'panel.component.ts', registry);
    expectCompiles(result);

    const deps = depsArrayFor(result);
    // sibling declaration from the owning module
    expect(deps).toContain('HighlightDirective');
    // directive re-exported by an imported module (transitive scope)
    expect(deps).toContain('SharedDirective');
    // every dependency resolved to a real selector, none left unresolved
    expect(result).not.toContain('_unresolved-');
  });

  it('resolves ModuleWithProviders (forRoot) imports in declared-component scope', () => {
    const widgetSrc = `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-widget',
        standalone: false,
        template: '<i config></i>',
      })
      export class WidgetComponent {}
    `;
    const configDirectiveSrc = `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[config]' })
      export class ConfigDirective {}
    `;
    const configModuleSrc = `
      import { NgModule, ModuleWithProviders } from '@angular/core';
      import { ConfigDirective } from './config.directive';
      @NgModule({ declarations: [ConfigDirective], exports: [ConfigDirective] })
      export class ConfigModule {
        static forRoot(): ModuleWithProviders<ConfigModule> {
          return { ngModule: ConfigModule };
        }
      }
    `;
    const widgetModuleSrc = `
      import { NgModule } from '@angular/core';
      import { WidgetComponent } from './widget.component';
      import { ConfigModule } from './config.module';
      @NgModule({
        declarations: [WidgetComponent],
        imports: [ConfigModule.forRoot()],
      })
      export class WidgetModule {}
    `;

    const registry = buildRegistry({
      'widget.component.ts': widgetSrc,
      'config.directive.ts': configDirectiveSrc,
      'config.module.ts': configModuleSrc,
      'widget.module.ts': widgetModuleSrc,
    });

    const result = compile(widgetSrc, 'widget.component.ts', registry);
    expectCompiles(result);

    const deps = depsArrayFor(result);
    // directive exported by the module imported via `ConfigModule.forRoot()`
    expect(deps).toContain('ConfigDirective');
    expect(result).not.toContain('_unresolved-');
  });

  it('treats a declared component that omits `standalone` per the Angular version', () => {
    // Angular 19+ defaults `standalone` to true, so a component must set
    // `standalone: false` to be NgModule-declared. On v17/v18 the flag is
    // usually omitted (it defaulted to false), so the owning-module scope must
    // still apply there. This asserts both sides of that version gate.
    const componentSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-bare', template: '<div sibling></div>' })
      export class BareComponent {}
    `;
    const siblingSrc = `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[sibling]' })
      export class SiblingDirective {}
    `;
    const moduleSrc = `
      import { NgModule } from '@angular/core';
      import { BareComponent } from './bare.component';
      import { SiblingDirective } from './sibling.directive';
      @NgModule({ declarations: [BareComponent, SiblingDirective] })
      export class BareModule {}
    `;

    const registry = buildRegistry({
      'bare.component.ts': componentSrc,
      'sibling.directive.ts': siblingSrc,
      'bare.module.ts': moduleSrc,
    });

    const result = compile(componentSrc, 'bare.component.ts', registry);
    expectCompiles(result);
    const deps = depsArrayFor(result);

    if (ANGULAR_MAJOR < 19) {
      // pre-v19: omitted flag means non-standalone, so module scope applies
      expect(deps).toContain('SiblingDirective');
    } else {
      // v19+: omitted flag means standalone, so no module scope is forced
      expect(deps).not.toContain('SiblingDirective');
    }
  });
});
