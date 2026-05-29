import { promises as fsPromises } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ResolvedConfig } from 'vite';
import * as vite from 'vite';
import { preprocessCSS } from 'vite';

import { angularMajor, angularMinor, angularPatch } from '../utils/devkit.js';
import { debugCompile } from './debug.js';
import {
  locateComponentDecorators,
  locateStylesInArgs,
} from './oxc-hmr-helpers.js';

/**
 * Minimal subset of `@oxc-angular/vite/api` we depend on. Loaded lazily so the
 * native binary is only required when `fastCompileEngine: 'oxc'` is selected.
 */
interface OxcApi {
  transformAngularFile: (
    source: string,
    filename: string,
    options?: OxcTransformOptions | null,
    resolvedResources?: OxcResolvedResources | null,
  ) => Promise<OxcTransformResult>;
  extractComponentUrls: (
    source: string,
    filename: string,
  ) => Promise<{ templateUrls: string[]; styleUrls: string[] }>;
  /** Sync HMR module compilation used by the dev-only `@ng/component` middleware. */
  compileForHmrSync: (
    template: string,
    componentName: string,
    filePath: string,
    styles?: string[] | null,
    options?: OxcTransformOptions | null,
  ) => {
    hmrModule: string;
    componentId: string;
    templateJs: string;
    errors: Array<{ severity: string; message: string }>;
  };
  /**
   * Link partial Angular declarations (`ɵɵngDeclare*`) to their final
   * `ɵɵdefine*` form. Used by the linker plugin to process pre-compiled
   * Angular libraries published in partial format.
   */
  linkAngularPackage: (
    code: string,
    filename: string,
  ) => Promise<{ code: string; map?: string; linked: boolean }>;
}

interface OxcAngularVersion {
  major: number;
  minor: number;
  patch: number;
}

interface OxcTransformOptions {
  sourcemap?: boolean;
  jit?: boolean;
  hmr?: boolean;
  i18NUseExternalIds?: boolean;
  preserveWhitespaces?: boolean;
  emitClassMetadata?: boolean;
  minifyComponentStyles?: boolean;
  angularVersion?: OxcAngularVersion;
}

interface OxcResolvedResources {
  templates: Record<string, string>;
  styles: Record<string, string[]>;
}

interface OxcTransformResult {
  code: string;
  map?: string;
  dependencies: string[];
  /**
   * Per-component HMR template updates, keyed by `filePath@ClassName`.
   * Populated when `hmr: true` is set. The value is the compiled template
   * function JS, ready to feed into `generateHmrModule`. NAPI maps
   * surface as plain objects (`Record<string, string>`) on the JS side.
   */
  templateUpdates?: Record<string, string>;
  /**
   * Per-component HMR style updates, keyed by `filePath@ClassName`. Each
   * value is the post-encapsulation CSS array for that component.
   */
  styleUpdates?: Record<string, string[]>;
  errors: Array<{ severity: string; message: string }>;
  warnings: Array<{ severity: string; message: string }>;
}

let apiPromise: Promise<OxcApi> | undefined;

/**
 * Lazy accessor for the OXC NAPI surface used both by this adapter and
 * by `oxc-hmr.ts`. Cached so the native binary is loaded at most once
 * even when both call sites race on the first request.
 */
export async function loadOxcHmrApi(): Promise<OxcApi> {
  return loadOxcApi();
}

async function loadOxcApi(): Promise<OxcApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      try {
        // Dynamic import keeps `@oxc-angular/vite` a truly optional peer
        // dependency — the TS engine path doesn't pay the native-binary
        // load cost, and users who never opt in don't need it installed.
        const mod: unknown = await import(
          /* @vite-ignore */ '@oxc-angular/vite/api'
        );
        const api = mod as Partial<OxcApi>;
        if (
          typeof api.transformAngularFile !== 'function' ||
          typeof api.extractComponentUrls !== 'function' ||
          typeof api.compileForHmrSync !== 'function' ||
          typeof api.linkAngularPackage !== 'function'
        ) {
          throw new Error(
            'The installed version of @oxc-angular/vite does not export the expected api surface (transformAngularFile, extractComponentUrls, compileForHmrSync, linkAngularPackage).',
          );
        }
        return api as OxcApi;
      } catch (e) {
        const reason = (e as Error)?.message ?? String(e);
        throw new Error(
          "[@analogjs/vite-plugin-angular] fastCompileEngine: 'oxc' requires the optional peer dependency '@oxc-angular/vite'. Install it (e.g. `pnpm add -D @oxc-angular/vite`) or set fastCompileEngine: 'ts'.\n\nOriginal error: " +
            reason,
        );
      }
    })();
  }
  return apiPromise;
}

export interface OxcEngineContext {
  resolvedConfig: ResolvedConfig;
  inlineStylesExtension: string;
  liveReload: boolean;
  watchMode: boolean;
  /**
   * Enable JIT (Just-In-Time) compilation. When true, OXC emits the
   * downleveled-decorator form (synthesized `propDecorators`, factory
   * downleveling, signal-API metadata) instead of AOT Ivy definitions,
   * and templates/styles are loaded dynamically at runtime via the
   * `angular:jit:` virtual-module URLs handled in the plugin layer.
   *
   * Requires `@oxc-angular/vite` ≥ 0.0.30 for signal-API JIT lowering.
   */
  jit: boolean;
}

export interface OxcEngineResult {
  code: string;
  map: unknown;
  resourceDependencies: string[];
  /**
   * Per-component HMR template updates emitted by OXC when `hmr: true` is
   * passed (dev-only). Keyed by `filePath@ClassName`. The plugin layer
   * caches these and serves them from the `@ng/component` middleware on
   * the next request after a watcher event marks the component dirty.
   */
  templateUpdates: Record<string, string>;
  /** Per-component HMR style updates, keyed by `filePath@ClassName`. */
  styleUpdates: Record<string, string[]>;
}

async function preprocessStyleContent(
  content: string,
  filename: string,
  config: ResolvedConfig,
): Promise<string> {
  try {
    const processed = await preprocessCSS(content, filename, config);
    return processed.code;
  } catch (e) {
    if (debugCompile.enabled) {
      debugCompile(
        'oxc-engine: style preprocessing failed for %s: %s',
        filename,
        (e as Error)?.message,
      );
    }
    return content;
  }
}

/**
 * Rewrite every inline `styles:` entry in `code` to its preprocessed CSS
 * form, in-place. Returns the mutated source.
 *
 * Inline styles aren't part of OXC's `ResolvedResources` map (that one
 * is keyed by URL, for external `styleUrl` / `styleUrls`), so the only
 * place Vite's `preprocessCSS` pipeline can run on `styles: ['…scss…']`
 * literals is *before* the source reaches OXC. We walk each
 * `@Component(...)` decorator, find every string-literal element inside
 * its `styles:` array (or its bare string form), pipe each through Vite,
 * and substitute the result back as a JSON-quoted plain-CSS literal.
 *
 * No-op when `inlineExt === 'css'` — OXC handles CSS natively.
 *
 * Substitutions are applied from highest offset to lowest so earlier
 * offsets stay valid while the string is mutated from the end backwards.
 */
async function rewriteInlineStyles(
  code: string,
  filename: string,
  inlineExt: string,
  config: ResolvedConfig,
): Promise<string> {
  if (inlineExt === 'css') return code;

  const decorators = locateComponentDecorators(code);
  if (decorators.length === 0) return code;

  const tasks: Array<{ start: number; end: number; content: string }> = [];
  for (const d of decorators) {
    const stylesRange = locateStylesInArgs(code, d.argsRange);
    if (!stylesRange) continue;
    const [openIdx, closeIdx] = stylesRange;
    if (code[openIdx] === '[') {
      const body = code.slice(openIdx + 1, closeIdx);
      const stringRe = /`([\s\S]*?)`|'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;
      let m: RegExpExecArray | null;
      while ((m = stringRe.exec(body)) !== null) {
        const absStart = openIdx + 1 + m.index;
        tasks.push({
          start: absStart,
          end: absStart + m[0].length,
          content: m[1] ?? m[2] ?? m[3] ?? '',
        });
      }
    } else {
      // Bare-string form: `styles: '…'`. Range covers the literal incl. quotes.
      tasks.push({
        start: openIdx,
        end: closeIdx + 1,
        content: code.slice(openIdx + 1, closeIdx),
      });
    }
  }

  if (tasks.length === 0) return code;

  const preprocessed = await Promise.all(
    tasks.map(async (t, i) => {
      // Synthetic path with the right extension so Vite picks the
      // matching preprocessor (Sass/Less/etc.).
      const fakePath = filename.replace(/\.ts$/, `.inline-${i}.${inlineExt}`);
      return preprocessStyleContent(t.content, fakePath, config);
    }),
  );

  let out = code;
  for (let i = tasks.length - 1; i >= 0; i--) {
    const { start, end } = tasks[i];
    out =
      out.slice(0, start) + JSON.stringify(preprocessed[i]) + out.slice(end);
  }
  return out;
}

export async function oxcTransform(
  code: string,
  id: string,
  ctx: OxcEngineContext,
): Promise<OxcEngineResult> {
  const api = await loadOxcApi();

  // Run Vite's CSS preprocessor over every inline `styles:` literal
  // before OXC sees the source. OXC operates on plain CSS and has no
  // slot for pre-processed inline styles (`ResolvedResources.styles`
  // is keyed by URL, not by inline-array index), so the substitution
  // has to happen at the source level. No-op when the user is on
  // `inlineStylesExtension: 'css'`.
  code = await rewriteInlineStyles(
    code,
    id,
    ctx.inlineStylesExtension,
    ctx.resolvedConfig,
  );

  const { templateUrls, styleUrls } = await api.extractComponentUrls(code, id);
  const dir = dirname(id);

  const templates: Record<string, string> = {};
  const styles: Record<string, string[]> = {};
  const resourceDependencies: string[] = [];

  for (const url of templateUrls) {
    const filePath = resolve(dir, url);
    resourceDependencies.push(filePath);
    try {
      templates[url] = await fsPromises.readFile(filePath, 'utf-8');
    } catch (e) {
      if (debugCompile.enabled) {
        debugCompile(
          'oxc-engine: failed to read templateUrl %s (resolved %s): %s',
          url,
          filePath,
          (e as Error)?.message,
        );
      }
    }
  }

  for (const url of styleUrls) {
    const filePath = resolve(dir, url);
    resourceDependencies.push(filePath);
    try {
      const raw = await fsPromises.readFile(filePath, 'utf-8');
      const css = await preprocessStyleContent(
        raw,
        filePath,
        ctx.resolvedConfig,
      );
      styles[url] = [css];
    } catch (e) {
      if (debugCompile.enabled) {
        debugCompile(
          'oxc-engine: failed to read styleUrl %s (resolved %s): %s',
          url,
          filePath,
          (e as Error)?.message,
        );
      }
    }
  }

  // Emit HMR-flavored output in dev when live reload is enabled. The
  // plugin layer pairs this with the `@ng/component` virtual-module
  // middleware to deliver per-component updates instead of full reloads.
  const hmr = ctx.liveReload && ctx.watchMode;

  const result = await api.transformAngularFile(
    code,
    id,
    {
      sourcemap: true,
      hmr,
      jit: ctx.jit,
      emitClassMetadata: true,
      angularVersion: {
        major: angularMajor,
        minor: angularMinor,
        patch: angularPatch,
      },
    },
    { templates, styles },
  );

  for (const err of result.errors) {
    throw new Error(`[oxc-angular] ${err.message} (${id})`);
  }
  if (debugCompile.enabled && result.warnings.length > 0) {
    for (const warn of result.warnings) {
      debugCompile('oxc-engine: warning in %s: %s', id, warn.message);
    }
  }

  // OXC returns the source map as a serialized JSON string; Vite accepts
  // either a string or an object, but downstream `transformWithOxc`
  // callers in the TS path expect an object — parse for consistency.
  let map: unknown = null;
  if (result.map) {
    try {
      map = JSON.parse(result.map);
    } catch {
      map = result.map;
    }
  }

  // OXC@0.0.30 augments the class with Ivy static members (ɵcmp / ɵdir /
  // ɵpip / ɵfac / ɵprov / ɵinj) but leaves the original field initializers
  // and decorator arguments unmodified — so for a signal-API directive
  // like `label = input<string>('')` the type argument survives into the
  // output. That's invalid JS once the file leaves Vite's plugin
  // boundary, so we run a single TS strip pass here to match what the
  // in-tree TS engine does after `compile()`.
  const stripped = vite.transformWithOxc
    ? await vite.transformWithOxc(
        result.code,
        id,
        {
          lang: 'ts',
          sourcemap: !!map,
          decorator: { legacy: false, emitDecoratorMetadata: false },
        },
        map as never,
      )
    : await vite.transformWithEsbuild(
        result.code,
        id,
        { loader: 'ts', sourcemap: !!map },
        map as never,
      );

  return {
    code: stripped.code,
    map: stripped.map ?? map,
    resourceDependencies,
    templateUpdates: result.templateUpdates ?? {},
    styleUpdates: result.styleUpdates ?? {},
  };
}
