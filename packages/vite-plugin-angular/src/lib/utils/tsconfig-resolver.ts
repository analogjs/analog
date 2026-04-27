/**
 * Shared tsconfig resolution logic used by both the ngtsc and compilation-api
 * compilation plugins. Encapsulates the caching, include-glob discovery,
 * tsconfig-graph expansion, and path-root resolution that were previously
 * duplicated across angular-vite-plugin.ts and compilation-api-plugin.ts.
 */

import * as compilerCli from '@angular/compiler-cli';
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { normalizePath, ResolvedConfig } from 'vite';
import { globSync } from 'tinyglobby';
import { debugEmit, debugEmitV } from './debug.js';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export interface TsconfigResolverOptions {
  workspaceRoot: string;
  include: string[];
  liveReload: boolean;
  hasTailwindCss: boolean;
  isTest: boolean;
}

export class TsconfigResolver {
  private includeCache: string[] = [];
  private tsconfigOptionsCache = new Map<
    string,
    { options: any; rootNames: string[] }
  >();
  private tsconfigGraphRootCache = new Map<string, string[]>();

  constructor(private options: TsconfigResolverOptions) {}

  invalidateIncludeCache(): void {
    this.includeCache = [];
  }

  invalidateTsconfigCaches(): void {
    this.tsconfigOptionsCache.clear();
    this.tsconfigGraphRootCache.clear();
  }

  invalidateAll(): void {
    this.invalidateIncludeCache();
    this.invalidateTsconfigCaches();
  }

  ensureIncludeCache(): string[] {
    if (this.options.include.length > 0 && this.includeCache.length === 0) {
      this.includeCache = this.findIncludes();
      debugEmit('include cache populated', {
        fileCount: this.includeCache.length,
      });
    }
    return this.includeCache;
  }

  readAngularTsconfigConfiguration(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ) {
    const isProd = config.mode === 'production';
    return compilerCli.readConfiguration(resolvedTsConfigPath, {
      suppressOutputPathCheck: true,
      outDir: undefined,
      sourceMap: false,
      inlineSourceMap: !isProd,
      inlineSources: !isProd,
      declaration: false,
      declarationMap: false,
      allowEmptyCodegenFiles: false,
      annotationsAs: 'decorators',
      enableResourceInlining: false,
      noEmitOnError: false,
      mapRoot: '',
      sourceRoot: '',
      supportTestBed: false,
      supportJitMode: false,
    });
  }

  getCachedTsconfigOptions(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ): { options: any; rootNames: string[] } {
    const tsconfigKey = this.getTsconfigCacheKey(resolvedTsConfigPath, config);
    let cached = this.tsconfigOptionsCache.get(tsconfigKey);

    if (!cached) {
      const read = this.readAngularTsconfigConfiguration(
        resolvedTsConfigPath,
        config,
      );
      cached = { options: read.options, rootNames: read.rootNames };
      this.tsconfigOptionsCache.set(tsconfigKey, cached);
      debugEmit('tsconfig root names loaded', {
        resolvedTsConfigPath,
        rootNameCount: read.rootNames.length,
      });
      debugEmitV('tsconfig root names', {
        resolvedTsConfigPath,
        rootNames: read.rootNames.map((file: string) => normalizePath(file)),
      });
    }

    return cached;
  }

  collectExpandedTsconfigRoots(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
    visited = new Set<string>(),
  ): string[] {
    const normalizedTsConfigPath = normalizePath(resolvedTsConfigPath);
    if (visited.has(normalizedTsConfigPath)) {
      return [];
    }

    const tsconfigKey = `${this.getTsconfigCacheKey(normalizedTsConfigPath, config)}|graph`;
    const cached = this.tsconfigGraphRootCache.get(tsconfigKey);
    if (cached) {
      return cached;
    }

    visited.add(normalizedTsConfigPath);

    const read = this.readAngularTsconfigConfiguration(
      normalizedTsConfigPath,
      config,
    );
    const rawTsconfig = (ts.readConfigFile(
      normalizedTsConfigPath,
      ts.sys.readFile,
    ).config ?? {}) as {
      compilerOptions?: {
        baseUrl?: unknown;
        paths?: Record<string, string[]>;
      };
      references?: Array<{ path?: unknown }>;
    };

    const expandedRoots = new Set(
      read.rootNames.map((file: string) => normalizePath(file)),
    );
    const pathRoots = collectTsconfigPathRoots(
      normalizedTsConfigPath,
      read.options,
      rawTsconfig,
    );
    for (const pathRoot of pathRoots) {
      expandedRoots.add(pathRoot);
    }

    const referenceConfigs = (rawTsconfig.references ?? [])
      .flatMap((reference) =>
        typeof reference.path === 'string'
          ? [
              resolveReferenceTsconfigPath(
                reference.path,
                normalizedTsConfigPath,
              ),
            ]
          : [],
      )
      .filter((reference): reference is string => !!reference);

    for (const referenceConfig of referenceConfigs) {
      for (const referenceRoot of this.collectExpandedTsconfigRoots(
        referenceConfig,
        config,
        visited,
      )) {
        expandedRoots.add(referenceRoot);
      }
    }

    const expandedRootList = [...expandedRoots];
    this.tsconfigGraphRootCache.set(tsconfigKey, expandedRootList);
    debugEmit('expanded tsconfig graph roots', {
      resolvedTsConfigPath: normalizedTsConfigPath,
      directRootNameCount: read.rootNames.length,
      pathRootCount: pathRoots.length,
      referenceConfigCount: referenceConfigs.length,
      expandedRootCount: expandedRootList.length,
    });
    debugEmitV('expanded tsconfig graph root files', {
      resolvedTsConfigPath: normalizedTsConfigPath,
      pathRoots,
      referenceConfigs,
      rootNames: expandedRootList,
    });

    return expandedRootList;
  }

  private getTsconfigCacheKey(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ): string {
    const isProd = config.mode === 'production';
    return [
      resolvedTsConfigPath,
      isProd ? 'prod' : 'dev',
      this.options.isTest ? 'test' : 'app',
      config.build?.lib ? 'lib' : 'nolib',
      this.options.liveReload ? 'live-reload' : 'no-live-reload',
      this.options.hasTailwindCss ? 'tw' : 'notw',
    ].join('|');
  }

  private findIncludes(): string[] {
    const globs = this.options.include.map((glob) =>
      normalizeIncludeGlob(this.options.workspaceRoot, glob),
    );
    const files = globSync(globs, { dot: true, absolute: true });
    debugEmit('include discovery', {
      patternCount: globs.length,
      fileCount: files.length,
    });
    debugEmitV('include discovery files', {
      globs,
      files: files.map((file) => normalizePath(file)),
    });
    return files;
  }
}

export function normalizeIncludeGlob(
  workspaceRoot: string,
  glob: string,
): string {
  const normalizedWorkspaceRoot = normalizePath(resolve(workspaceRoot));
  const normalizedGlob = normalizePath(glob);

  if (
    normalizedGlob === normalizedWorkspaceRoot ||
    normalizedGlob.startsWith(`${normalizedWorkspaceRoot}/`)
  ) {
    return normalizedGlob;
  }

  if (normalizedGlob.startsWith('/')) {
    return `${normalizedWorkspaceRoot}${normalizedGlob}`;
  }

  return normalizePath(resolve(normalizedWorkspaceRoot, normalizedGlob));
}

function resolveReferenceTsconfigPath(
  referencePath: string,
  ownerTsconfigPath: string,
): string | undefined {
  const ownerDir = dirname(ownerTsconfigPath);
  const resolvedReference = normalizePath(
    isAbsolute(referencePath)
      ? referencePath
      : resolve(ownerDir, referencePath),
  );

  if (existsSync(resolvedReference)) {
    try {
      if (statSync(resolvedReference).isDirectory()) {
        const nestedTsconfig = join(resolvedReference, 'tsconfig.json');
        return existsSync(nestedTsconfig)
          ? normalizePath(nestedTsconfig)
          : undefined;
      }
    } catch {
      return undefined;
    }
    return resolvedReference;
  }

  if (!resolvedReference.endsWith('.json')) {
    const asJson = `${resolvedReference}.json`;
    if (existsSync(asJson)) {
      return normalizePath(asJson);
    }
    const nestedTsconfig = join(resolvedReference, 'tsconfig.json');
    if (existsSync(nestedTsconfig)) {
      return normalizePath(nestedTsconfig);
    }
  }

  return undefined;
}

function collectTsconfigPathRoots(
  resolvedTsConfigPath: string,
  options: any,
  rawTsconfig: {
    compilerOptions?: {
      baseUrl?: unknown;
      paths?: Record<string, string[]>;
    };
  },
): string[] {
  const tsPaths = rawTsconfig.compilerOptions?.paths ?? options.paths;
  if (!tsPaths) {
    return [];
  }

  const tsconfigDir = dirname(resolvedTsConfigPath);
  const configuredBaseUrl =
    typeof options.baseUrl === 'string'
      ? options.baseUrl
      : typeof rawTsconfig.compilerOptions?.baseUrl === 'string'
        ? rawTsconfig.compilerOptions.baseUrl
        : undefined;
  const resolvedBaseUrl = configuredBaseUrl
    ? isAbsolute(configuredBaseUrl)
      ? configuredBaseUrl
      : resolve(tsconfigDir, configuredBaseUrl)
    : tsconfigDir;
  const discoveredRoots = new Set<string>();

  for (const targets of Object.values(tsPaths)) {
    for (const target of targets as string[]) {
      const resolvedTarget = normalizePath(
        isAbsolute(target) ? target : resolve(resolvedBaseUrl, target),
      );

      if (target.includes('*')) {
        for (const match of globSync(resolvedTarget, {
          dot: true,
          absolute: true,
        })) {
          discoveredRoots.add(normalizePath(match));
        }
        continue;
      }

      if (existsSync(resolvedTarget)) {
        discoveredRoots.add(resolvedTarget);
      }
    }
  }

  return [...discoveredRoots];
}
