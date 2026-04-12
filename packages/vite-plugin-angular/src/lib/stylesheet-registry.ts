import { createHash } from 'node:crypto';
import { dirname, normalize, resolve } from 'node:path';
import { normalizePath } from 'vite';
import type {
  StylePreprocessor,
  StylesheetDependency,
  StylesheetDiagnostic,
  StylesheetTransformResult,
  StylesheetTransformContext,
} from './style-preprocessor.js';
import { normalizeStylesheetTransformResult as normalizeTransformResult } from './style-preprocessor.js';

export interface AnalogStylesheetRecord {
  publicId: string;
  sourcePath?: string;
  originalCode?: string;
  normalizedCode: string;
  dependencies?: StylesheetDependency[];
  diagnostics?: StylesheetDiagnostic[];
  tags?: string[];
}

export class AnalogStylesheetRegistry {
  private servedById = new Map<string, AnalogStylesheetRecord>();
  private servedAliasToId = new Map<string, string>();
  private externalRequestToSource = new Map<string, string>();
  /**
   * Maps a real source stylesheet path back to the generated public stylesheet
   * ids Analog serves for Angular. This is stable across requests and lets HMR
   * reason about "which virtual stylesheet came from this source file?"
   */
  private sourceToPublicIds = new Map<string, Set<string>>();
  /**
   * Tracks the live request ids Vite/Angular have actually served for a source
   * stylesheet, including both `?direct&ngcomp=...` CSS modules and
   * `?ngcomp=...` JS wrapper modules. HMR must use these live request ids
   * because Angular component styles are no longer addressed by their original
   * file paths once externalized.
   */
  private sourceToRequestIds = new Map<string, Set<string>>();
  private sourceToDependencies = new Map<string, StylesheetDependency[]>();
  private sourceToDiagnostics = new Map<string, StylesheetDiagnostic[]>();
  private sourceToTags = new Map<string, string[]>();

  /**
   * Canonicalizes browser-facing stylesheet request ids so Vite timestamp
   * variants (`?t=...`) and path-shape variants (`abc.css?...` vs
   * `/abc.css?...`) all collapse onto one logical module identity.
   *
   * This is critical for Angular component stylesheet HMR because the browser
   * can keep both timestamped and non-timestamped requests alive for the same
   * externalized stylesheet. If Analog tracks them as distinct resources, HMR
   * can update one module while the browser continues rendering another stale
   * module for the same public stylesheet id.
   */
  private normalizeRequestId(requestId: string): string {
    const [rawPathname, rawSearch = ''] = requestId.split('?');
    const normalizedPathname = rawPathname.replace(/^\//, '');

    if (!rawSearch) {
      return normalizedPathname;
    }

    // Preserve bare query flags like `?direct&ngcomp=...` exactly. Using
    // URLSearchParams reserializes `direct` as `direct=`, which changes the
    // module identity and breaks Vite module-graph lookups for Angular's
    // externalized component stylesheet requests.
    const normalizedSearch = rawSearch
      .split('&')
      .filter((segment) => segment.length > 0)
      .filter((segment) => {
        const [key] = segment.split('=');
        return key !== 't';
      })
      .join('&');

    return normalizedSearch
      ? `${normalizedPathname}?${normalizedSearch}`
      : normalizedPathname;
  }

  get servedCount(): number {
    return this.servedById.size;
  }

  get externalCount(): number {
    return this.externalRequestToSource.size;
  }

  hasServed(requestId: string): boolean {
    return this.resolveServedRecord(requestId) !== undefined;
  }

  getServedContent(requestId: string): string | undefined {
    return this.resolveServedRecord(requestId)?.normalizedCode;
  }

  resolveExternalSource(requestId: string): string | undefined {
    const normalizedRequestId = this.normalizeRequestId(requestId);
    return this.externalRequestToSource.get(normalizedRequestId);
  }

  getPublicIdsForSource(sourcePath: string): string[] {
    return [...(this.sourceToPublicIds.get(sourcePath) ?? [])];
  }

  getRequestIdsForSource(sourcePath: string): string[] {
    return [...(this.sourceToRequestIds.get(sourcePath) ?? [])];
  }

  getDependenciesForSource(sourcePath: string): StylesheetDependency[] {
    return [...(this.sourceToDependencies.get(sourcePath) ?? [])];
  }

  getDiagnosticsForSource(sourcePath: string): StylesheetDiagnostic[] {
    return [...(this.sourceToDiagnostics.get(sourcePath) ?? [])];
  }

  getTagsForSource(sourcePath: string): string[] {
    return [...(this.sourceToTags.get(sourcePath) ?? [])];
  }

  registerExternalRequest(requestId: string, sourcePath: string): void {
    this.externalRequestToSource.set(
      this.normalizeRequestId(requestId),
      sourcePath,
    );
  }

  registerActiveRequest(requestId: string): void {
    // Requests arrive in multiple shapes depending on who asked for the
    // stylesheet (`abc123.css?...` vs `/abc123.css?...`). Normalize both back to
    // the source file so later HMR events for `/src/...component.css` can find
    // the currently active virtual requests.
    const normalizedRequestId = this.normalizeRequestId(requestId);
    const requestPath = normalizedRequestId.split('?')[0];
    const sourcePath =
      this.resolveExternalSource(requestPath) ??
      this.resolveExternalSource(requestPath.replace(/^\//, ''));
    if (!sourcePath) {
      return;
    }

    const requestIds = this.sourceToRequestIds.get(sourcePath) ?? new Set();
    requestIds.add(normalizedRequestId);
    // Angular component styles are served through both a direct CSS request
    // (`?direct&ngcomp=...`) and a JS wrapper request (`?ngcomp=...`). The
    // browser can already have the wrapper loaded even when Vite's live module
    // graph only surfaces the direct request during a CSS-only edit. Track the
    // derived wrapper id eagerly so HMR can reason about the browser-visible
    // stylesheet identity without waiting for that wrapper request to be
    // observed later in the session.
    if (normalizedRequestId.includes('?direct&ngcomp=')) {
      requestIds.add(
        normalizedRequestId.replace('?direct&ngcomp=', '?ngcomp='),
      );
    }
    this.sourceToRequestIds.set(sourcePath, requestIds);
  }

  registerServedStylesheet(
    record: AnalogStylesheetRecord,
    aliases: string[] = [],
  ): void {
    const publicId = this.normalizeRequestId(record.publicId);
    this.servedById.set(publicId, { ...record, publicId });
    this.servedAliasToId.set(publicId, publicId);

    for (const alias of aliases) {
      this.servedAliasToId.set(this.normalizeRequestId(alias), publicId);
    }

    if (record.sourcePath) {
      const publicIds =
        this.sourceToPublicIds.get(record.sourcePath) ?? new Set();
      publicIds.add(publicId);
      this.sourceToPublicIds.set(record.sourcePath, publicIds);
      this.recomputeSourceMetadata(record.sourcePath);
    }
  }

  private recomputeSourceMetadata(sourcePath: string): void {
    const dependencies = new Map<string, StylesheetDependency>();
    const diagnostics = new Map<string, StylesheetDiagnostic>();
    const tags = new Set<string>();

    for (const publicId of this.sourceToPublicIds.get(sourcePath) ?? []) {
      const record = this.servedById.get(publicId);
      if (!record) {
        continue;
      }

      for (const dependency of record.dependencies ?? []) {
        const key = `${dependency.kind ?? 'unknown'}:${dependency.id}:${dependency.owner ?? ''}`;
        dependencies.set(key, dependency);
      }

      for (const diagnostic of record.diagnostics ?? []) {
        const key = `${diagnostic.severity}:${diagnostic.code}:${diagnostic.message}`;
        diagnostics.set(key, diagnostic);
      }

      for (const tag of record.tags ?? []) {
        tags.add(tag);
      }
    }

    this.sourceToDependencies.set(sourcePath, [...dependencies.values()]);
    this.sourceToDiagnostics.set(sourcePath, [...diagnostics.values()]);
    this.sourceToTags.set(sourcePath, [...tags]);
  }

  private resolveServedRecord(
    requestId: string,
  ): AnalogStylesheetRecord | undefined {
    const normalizedRequestId = this.normalizeRequestId(requestId);
    const publicId =
      this.servedAliasToId.get(normalizedRequestId) ??
      this.servedAliasToId.get(normalizedRequestId.split('?')[0]) ??
      normalizedRequestId.split('?')[0];
    return this.servedById.get(publicId);
  }
}

export function preprocessStylesheet(
  code: string,
  filename: string,
  stylePreprocessor?: StylePreprocessor,
  context?: StylesheetTransformContext,
): string {
  return preprocessStylesheetResult(code, filename, stylePreprocessor, context)
    .code;
}

export function preprocessStylesheetResult(
  code: string,
  filename: string,
  stylePreprocessor?: StylePreprocessor,
  context?: StylesheetTransformContext,
): StylesheetTransformResult {
  return normalizeTransformResult(
    stylePreprocessor?.(code, filename, context),
    code,
  );
}

export function rewriteRelativeCssImports(
  code: string,
  filename: string,
): string {
  const cssDir = dirname(filename);
  return code.replace(
    /@import\s+(?:url\(\s*(["']?)(\.[^'")\s;]+)\1\s*\)|(["'])(\.[^'"]+)\3)/g,
    (_match, urlQuote, urlPath, stringQuote, stringPath) => {
      const relPath = urlPath ?? stringPath;
      const absPath = resolve(cssDir, relPath);

      if (typeof urlPath === 'string') {
        return `@import url(${urlQuote}${absPath}${urlQuote})`;
      }

      return `@import ${stringQuote}${absPath}${stringQuote}`;
    },
  );
}

export function registerStylesheetContent(
  registry: AnalogStylesheetRegistry,
  {
    code,
    dependencies,
    diagnostics,
    tags,
    containingFile,
    className,
    order,
    inlineStylesExtension,
    resourceFile,
  }: {
    code: string;
    dependencies?: StylesheetDependency[];
    diagnostics?: StylesheetDiagnostic[];
    tags?: string[];
    containingFile: string;
    className?: string;
    order?: number;
    inlineStylesExtension: string;
    resourceFile?: string;
  },
): string {
  const id = createHash('sha256')
    .update(containingFile)
    .update(className ?? '')
    .update(String(order ?? 0))
    .update(code)
    .digest('hex');
  const stylesheetId = `${id}.${inlineStylesExtension}`;

  const aliases: string[] = [];

  if (resourceFile) {
    const normalizedResourceFile = normalizePath(normalize(resourceFile));
    // Avoid basename-only aliases here: shared filenames like `index.css`
    // can collide across components and break HMR lookups.
    aliases.push(
      resourceFile,
      normalizedResourceFile,
      resourceFile.replace(/^\//, ''),
      normalizedResourceFile.replace(/^\//, ''),
    );
  }

  registry.registerServedStylesheet(
    {
      publicId: stylesheetId,
      sourcePath: resourceFile,
      normalizedCode: code,
      dependencies,
      diagnostics,
      tags,
    },
    aliases,
  );

  return stylesheetId;
}
