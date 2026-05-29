import { promises as fsPromises } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ResolvedConfig } from 'vite';
import * as vite from 'vite';
import { preprocessCSS } from 'vite';

import { angularMajor, angularMinor, angularPatch } from '../utils/devkit.js';
import { debugCompile } from './debug.js';

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
          typeof api.compileForHmrSync !== 'function'
        ) {
          throw new Error(
            'The installed version of @oxc-angular/vite does not export the expected api surface (transformAngularFile, extractComponentUrls, compileForHmrSync).',
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

export async function oxcTransform(
  code: string,
  id: string,
  ctx: OxcEngineContext,
): Promise<OxcEngineResult> {
  const api = await loadOxcApi();

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
      jit: false,
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
