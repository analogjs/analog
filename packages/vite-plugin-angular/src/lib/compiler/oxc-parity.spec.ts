/**
 * Parity tests: TS engine (`./compile.js`) vs OXC engine
 * (`@oxc-angular/vite/api`, wrapped by `./oxc-engine.ts`).
 *
 * Each fixture compiles a small Angular source through both engines and
 * asserts a set of regex features must appear in BOTH outputs. The goal
 * is not byte-exact equivalence — full-mode emits differ in argument
 * shape, identifier naming, and constant pooling — but rather a
 * shared-feature contract: did the same Ivy calls happen, with the same
 * selectors / bindings / standalone flags / factory shapes?
 *
 * Soft assertions (`expect.soft`) are used so a single fixture surfaces
 * every divergence in one run instead of bailing on the first mismatch.
 * That makes the failure list a real "what's left" punch list.
 *
 * To temporarily mark a known gap without blocking CI, add the fixture
 * `name` to `KNOWN_OXC_GAPS` below — the harness will downgrade its
 * assertions to `console.warn` instead of failing.
 */
import { promises as fsPromises, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSync } from 'oxc-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compile as tsCompile } from './compile.js';
import { oxcTransform } from './oxc-engine.js';

type EngineOutput =
  | { code: string; error?: undefined }
  | { code?: undefined; error: Error };

interface Fixture {
  name: string;
  /** TS source. Either inline (`code`) or built lazily after `setup()` runs. */
  code?: string;
  setup?: (dir: string) => Promise<{ code: string; fileName: string }>;
  fileName?: string;
  /** Patterns each engine's output must contain. */
  features: RegExp[];
  /** Patterns specifically tested against the OXC output only. */
  oxcOnly?: RegExp[];
  /** Patterns specifically tested against the TS output only. */
  tsOnly?: RegExp[];
}

/**
 * Fixtures whose parity assertions are known to fail against
 * `@oxc-angular/vite@0.0.30`. Recorded here so the suite stays green
 * while we file upstream tickets — flipping a fixture out of this list
 * is what closes the gap.
 *
 * Populated empirically by running the suite once with the list empty
 * and observing which fixtures diverge.
 */
const KNOWN_OXC_GAPS = new Set<string>();

let oxcAvailable = true;
let oxcSkipReason = '';

// Stub Vite ResolvedConfig — only consulted by OXC's external-styleUrl
// preprocessing, which our fixtures don't exercise (all styles are inline
// or plain CSS in templateUrl-style files). The cast keeps the harness
// from pulling Vite's full type surface into the test.
const FAKE_RESOLVED_CONFIG = {
  root: process.cwd(),
  command: 'build' as const,
  mode: 'production',
  isProduction: true,
  css: {},
} as unknown as Parameters<typeof oxcTransform>[2]['resolvedConfig'];

const OXC_CTX: Parameters<typeof oxcTransform>[2] = {
  resolvedConfig: FAKE_RESOLVED_CONFIG,
  inlineStylesExtension: 'css',
  liveReload: false,
  watchMode: false,
};

let scratchDir: string;

beforeAll(async () => {
  scratchDir = mkdtempSync(join(tmpdir(), 'oxc-parity-'));
  try {
    // Sanity-load the adapter once. Pulling the binary in `beforeAll`
    // makes the first per-fixture assertion's error message about the
    // fixture itself, not the missing peer dep.
    await oxcTransform(
      `import { Component } from '@angular/core';\n@Component({ selector: 'x', template: '' })\nexport class X {}\n`,
      join(scratchDir, '__warmup__.ts'),
      OXC_CTX,
    );
  } catch (e) {
    oxcAvailable = false;
    oxcSkipReason = (e as Error)?.message ?? String(e);
  }
});

afterAll(async () => {
  try {
    await fsPromises.rm(scratchDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

function compileTs(code: string, fileName: string): EngineOutput {
  try {
    return { code: tsCompile(code, fileName).code };
  } catch (e) {
    return { error: e as Error };
  }
}

async function compileOxc(
  code: string,
  fileName: string,
): Promise<EngineOutput> {
  try {
    const result = await oxcTransform(code, fileName, OXC_CTX);
    return { code: result.code };
  } catch (e) {
    return { error: e as Error };
  }
}

const FIXTURES: Fixture[] = [
  {
    name: 'standalone component with inline template',
    fileName: 'comp-basic.ts',
    code: `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-basic',
        standalone: true,
        template: '<h1>Hello</h1>',
      })
      export class BasicComponent {}
    `,
    features: [
      /ɵɵdefineComponent/,
      /selectors:\s*\[\[\s*"app-basic"\s*\]\]/,
      /standalone:\s*true/,
      // TS engine emits `ClassName.ɵfac = …`; OXC emits the static as a
      // class field. Match either by anchoring on the symbol alone.
      /ɵfac\s*=/,
    ],
  },
  {
    name: 'component with signal input()',
    fileName: 'comp-input.ts',
    code: `
      import { Component, input } from '@angular/core';

      @Component({
        selector: 'app-input',
        standalone: true,
        template: '<p>{{ name() }}</p>',
      })
      export class InputComponent {
        name = input<string>('world');
      }
    `,
    features: [
      /ɵɵdefineComponent/,
      // Signal input emits as `name: [<flags>, "name", "name"]` in full mode.
      /name:\s*\[/,
    ],
  },
  {
    name: 'component with signal output()',
    fileName: 'comp-output.ts',
    code: `
      import { Component, output } from '@angular/core';

      @Component({
        selector: 'app-output',
        standalone: true,
        template: '<button (click)="ping.emit()">go</button>',
      })
      export class OutputComponent {
        ping = output<void>();
      }
    `,
    features: [/ɵɵdefineComponent/, /outputs:\s*\{[^}]*ping:\s*"ping"/],
  },
  {
    name: 'component with model() two-way binding',
    fileName: 'comp-model.ts',
    code: `
      import { Component, model } from '@angular/core';

      @Component({
        selector: 'app-model',
        standalone: true,
        template: '<input [value]="value()" />',
      })
      export class ModelComponent {
        value = model<string>('');
      }
    `,
    features: [
      /ɵɵdefineComponent/,
      /value:\s*\[/, // input side
      /value:\s*"valueChange"/, // output side (model emits a Change pair)
    ],
  },
  {
    name: 'component with viewChild() query',
    fileName: 'comp-view-child.ts',
    code: `
      import { Component, ElementRef, viewChild } from '@angular/core';

      @Component({
        selector: 'app-vc',
        standalone: true,
        template: '<div #target></div>',
      })
      export class VcComponent {
        target = viewChild<ElementRef>('target');
      }
    `,
    features: [/ɵɵdefineComponent/, /ɵɵviewQuerySignal/],
  },
  {
    name: 'component with @for control flow',
    fileName: 'comp-for.ts',
    code: `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-for',
        standalone: true,
        template: '@for (item of items; track item) { <span>{{ item }}</span> }',
      })
      export class ForComponent {
        items = [1, 2, 3];
      }
    `,
    features: [/ɵɵdefineComponent/, /ɵɵrepeater/],
  },
  {
    name: 'component with @if control flow',
    fileName: 'comp-if.ts',
    code: `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-if',
        standalone: true,
        template: '@if (visible) { <span>yes</span> }',
      })
      export class IfComponent {
        visible = true;
      }
    `,
    features: [/ɵɵdefineComponent/, /ɵɵconditional/],
  },
  {
    name: 'component with host bindings',
    fileName: 'comp-host.ts',
    code: `
      import { Component, HostBinding } from '@angular/core';

      @Component({
        selector: 'app-host',
        standalone: true,
        template: '',
        host: {
          '[class.active]': 'isActive',
          '(click)': 'onClick()',
        },
      })
      export class HostComponent {
        isActive = true;
        onClick() {}
      }
    `,
    features: [
      /ɵɵdefineComponent/,
      /hostVars/,
      /ɵɵclassProp\("active"/,
      /ɵɵlistener\("click"/,
    ],
  },
  {
    name: 'standalone directive',
    fileName: 'directive-basic.ts',
    code: `
      import { Directive, input } from '@angular/core';

      @Directive({
        selector: '[appBadge]',
        standalone: true,
      })
      export class BadgeDirective {
        label = input<string>('');
      }
    `,
    features: [
      /ɵɵdefineDirective/,
      // OXC packs as `[["","appBadge",""]]`; TS engine inserts spaces.
      /selectors:\s*\[\[\s*""\s*,\s*"appBadge"/,
      /standalone:\s*true/,
    ],
  },
  {
    name: 'standalone pure pipe',
    fileName: 'pipe-trim.ts',
    code: `
      import { Pipe, PipeTransform } from '@angular/core';

      @Pipe({ name: 'trim', standalone: true })
      export class TrimPipe implements PipeTransform {
        transform(v: string): string { return v.trim(); }
      }
    `,
    features: [
      /ɵɵdefinePipe/,
      /name:\s*"trim"/,
      /pure:\s*true|TrimPipe\.ɵpipe\s*=\s*[^;]*\}/,
    ],
  },
  {
    name: 'injectable providedIn root',
    fileName: 'service-root.ts',
    code: `
      import { Injectable } from '@angular/core';

      @Injectable({ providedIn: 'root' })
      export class RootService {
        hello() { return 'hi'; }
      }
    `,
    features: [
      /ɵɵdefineInjectable/,
      /providedIn:\s*['"]root['"]/,
      // OXC emits `static ɵfac = …` as a class field; TS engine assigns
      // `RootService.ɵfac = …` externally. Both should produce the symbol.
      /ɵfac\s*=/,
    ],
  },
  {
    name: 'ngmodule with declarations and exports',
    fileName: 'mod-basic.ts',
    code: `
      import { Component, NgModule } from '@angular/core';

      @Component({ selector: 'app-x', template: '', standalone: false })
      export class XComponent {}

      @NgModule({
        declarations: [XComponent],
        exports: [XComponent],
      })
      export class XModule {}
    `,
    features: [
      /ɵɵdefineNgModule|XModule\s*\.ɵmod\s*=/,
      /ɵɵdefineInjector|XModule\s*\.ɵinj\s*=/,
    ],
  },
  {
    name: 'component with constructor DI',
    fileName: 'comp-di.ts',
    code: `
      import { Component, ElementRef } from '@angular/core';

      @Component({
        selector: 'app-di',
        standalone: true,
        template: '',
      })
      export class DiComponent {
        constructor(public el: ElementRef) {}
      }
    `,
    features: [
      /ɵɵdefineComponent/,
      // Factory should inject ElementRef positionally.
      /ɵɵdirectiveInject\(\s*(?:i0\.)?ElementRef/,
    ],
  },
  {
    name: 'component with templateUrl on disk',
    setup: async (dir) => {
      const html = join(dir, 'tpl.html');
      writeFileSync(html, '<h2>from file</h2>');
      const ts = join(dir, 'comp-tpl.ts');
      return {
        fileName: ts,
        code: `
          import { Component } from '@angular/core';
          @Component({
            selector: 'app-tpl',
            standalone: true,
            templateUrl: './tpl.html',
          })
          export class TplComponent {}
        `,
      };
    },
    features: [/ɵɵdefineComponent/, /from file/],
  },
  {
    name: 'component with styleUrl on disk (plain css)',
    setup: async (dir) => {
      const css = join(dir, 'styles.css');
      writeFileSync(css, '.box { color: red; }');
      const ts = join(dir, 'comp-style.ts');
      return {
        fileName: ts,
        code: `
          import { Component } from '@angular/core';
          @Component({
            selector: 'app-style',
            standalone: true,
            template: '<div class="box"></div>',
            styleUrl: './styles.css',
          })
          export class StyleComponent {}
        `,
      };
    },
    features: [
      /ɵɵdefineComponent/,
      /\.box(\[ngcontent[^\]]*\])?\s*\{\s*color:\s*red/,
    ],
  },
  {
    name: '@defer block with on idle',
    fileName: 'comp-defer.ts',
    code: `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-defer',
        standalone: true,
        template: '@defer (on idle) { <span>now</span> }',
      })
      export class DeferComponent {}
    `,
    features: [/ɵɵdefineComponent/, /ɵɵdefer/],
  },
  {
    name: 'component with inject() in field initializer',
    fileName: 'comp-inject-fn.ts',
    code: `
      import { Component, ElementRef, inject } from '@angular/core';

      @Component({
        selector: 'app-inject-fn',
        standalone: true,
        template: '',
      })
      export class InjectFnComponent {
        private el = inject(ElementRef);
      }
    `,
    features: [
      /ɵɵdefineComponent/,
      // `inject()` is a runtime call inside the field initializer — it
      // survives unchanged in the output. Both engines should preserve it.
      /inject\(\s*ElementRef\s*\)/,
    ],
  },
  {
    name: 'component inheriting from base class',
    fileName: 'comp-inherit.ts',
    code: `
      import { Component, Directive } from '@angular/core';

      @Directive({ standalone: true })
      export class BaseDirective {
        baseValue = 1;
      }

      @Component({
        selector: 'app-inherit',
        standalone: true,
        template: '{{ baseValue }}',
      })
      export class InheritComponent extends BaseDirective {}
    `,
    features: [
      /ɵɵdefineComponent/,
      /ɵɵdefineDirective/,
      // Inherited factories use `ɵɵgetInheritedFactory` so the runtime
      // pulls deps from the parent. Missing this means DI breaks in
      // subclasses.
      /ɵɵgetInheritedFactory/,
    ],
  },
  {
    name: 'component with HostBinding field decorator',
    fileName: 'comp-hostbinding.ts',
    code: `
      import { Component, HostBinding } from '@angular/core';

      @Component({
        selector: 'app-hb',
        standalone: true,
        template: '',
      })
      export class HostBindingComponent {
        @HostBinding('class.active') isActive = true;
      }
    `,
    features: [/ɵɵdefineComponent/, /hostVars/, /ɵɵclassProp\(\s*"active"/],
  },
  {
    name: 'component with event listener in template',
    fileName: 'comp-listener.ts',
    code: `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-listener',
        standalone: true,
        template: '<button (click)="go()">go</button>',
      })
      export class ListenerComponent {
        go() {}
      }
    `,
    features: [/ɵɵdefineComponent/, /ɵɵlistener\(\s*"click"/],
  },
  {
    name: 'standalone component with imports of standalone directive',
    fileName: 'comp-imports.ts',
    code: `
      import { Component, Directive, input } from '@angular/core';

      @Directive({ selector: '[appHl]', standalone: true })
      export class HlDirective {
        appHl = input<string>('');
      }

      @Component({
        selector: 'app-imports',
        standalone: true,
        imports: [HlDirective],
        template: '<span appHl="x">hi</span>',
      })
      export class ImportsComponent {}
    `,
    features: [
      /ɵɵdefineComponent/,
      /ɵɵdefineDirective/,
      // Standalone imports surface as `dependencies: [HlDirective]` in
      // the TS engine or `dependencies: i0.ɵɵgetComponentDepsFactory(…)`
      // (cycle-safe wrapper) in OXC. Both should reference HlDirective.
      /dependencies:\s*\S+[\s\S]{0,200}HlDirective/,
    ],
  },
];

async function resolveFixture(
  fx: Fixture,
): Promise<{ code: string; fileName: string }> {
  if (fx.setup) {
    return fx.setup(scratchDir);
  }
  if (!fx.code || !fx.fileName) {
    throw new Error(`fixture "${fx.name}" missing code/fileName`);
  }
  return { code: fx.code, fileName: join(scratchDir, fx.fileName) };
}

function parsesAsJs(code: string, fileName: string): string | null {
  try {
    // `lang: 'js'` (default) — we expect every engine output to be valid
    // JavaScript after the TS-only syntax strip pass. A parse error here
    // means the output would break downstream Rolldown/Vite bundling.
    const result = parseSync(fileName.replace(/\.ts$/, '.js'), code);
    if (result.errors && result.errors.length > 0) {
      return result.errors.map((e) => e.message).join('; ');
    }
    return null;
  } catch (e) {
    return (e as Error)?.message ?? String(e);
  }
}

describe('OXC engine output parses as valid JS', () => {
  for (const fx of FIXTURES) {
    it(fx.name, async () => {
      if (!oxcAvailable) {
        return expect.fail(`@oxc-angular/vite not loadable: ${oxcSkipReason}`);
      }
      const { code, fileName } = await resolveFixture(fx);
      const out = await compileOxc(code, fileName);
      if (out.error) {
        return expect.fail(`OXC engine threw: ${out.error.message}`);
      }
      const parseErr = parsesAsJs(out.code, fileName);
      expect
        .soft(parseErr, `OXC output for "${fx.name}" failed to parse as JS`)
        .toBeNull();
    });
  }
});

describe('OXC engine parity with TS engine', () => {
  for (const fx of FIXTURES) {
    const known = KNOWN_OXC_GAPS.has(fx.name);
    const testFn = known ? it.fails : it;
    testFn(`${fx.name}${known ? ' [known gap]' : ''}`, async () => {
      if (!oxcAvailable) {
        return expect.fail(
          `@oxc-angular/vite not loadable, skipping parity: ${oxcSkipReason}`,
        );
      }

      const { code, fileName } = await resolveFixture(fx);

      const ts = compileTs(code, fileName);
      const oxc = await compileOxc(code, fileName);

      // Both engines should at least produce code. If either failed
      // outright, the fixture is interesting on its own — report the
      // failure verbosely instead of letting downstream regex checks
      // produce a confusing "cannot read .match of undefined".
      if (ts.error) {
        return expect.fail(`TS engine threw: ${ts.error.message}`);
      }
      if (oxc.error) {
        return expect.fail(`OXC engine threw: ${oxc.error.message}`);
      }

      for (const re of fx.features) {
        expect.soft(ts.code, `TS engine missing feature ${re}`).toMatch(re);
        expect.soft(oxc.code, `OXC engine missing feature ${re}`).toMatch(re);
      }
      for (const re of fx.tsOnly ?? []) {
        expect.soft(ts.code, `TS engine missing feature ${re}`).toMatch(re);
      }
      for (const re of fx.oxcOnly ?? []) {
        expect.soft(oxc.code, `OXC engine missing feature ${re}`).toMatch(re);
      }
    });
  }
});
