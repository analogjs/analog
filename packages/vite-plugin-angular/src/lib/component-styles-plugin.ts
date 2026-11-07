import { existsSync, readFileSync } from 'node:fs';
import { union } from 'es-toolkit';
import {
  normalizePath,
  type ModuleNode,
  type Plugin,
  type ViteDevServer,
} from 'vite';

import {
  ensureAngularBuildContext,
  getFilenameFromPath,
  type AngularBuildContext,
  type AngularBuildContextOptions,
} from './angular-build-context.js';
import {
  getComponentStyleSheetMeta,
  isComponentStyleSheet,
} from './encapsulation-plugin.js';
import type {
  StylePreprocessor,
  StylesheetDependency,
} from './style-preprocessor.js';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheet,
  rewriteRelativeCssImports,
} from './stylesheet-registry.js';
import { describeStylesheetContent } from './utils/compilation-shared.js';
import { debugHmr, debugHmrV, debugStylesV } from './utils/debug.js';

export interface ComponentStylesheetPipelineDiagnosis {
  file: string;
  sourcePath?: string;
  source?: ReturnType<typeof describeStylesheetContent>;
  registry?: ReturnType<typeof describeStylesheetContent>;
  dependencies: StylesheetDependency[];
  diagnostics: ReturnType<AnalogStylesheetRegistry['getDiagnosticsForSource']>;
  tags: string[];
  directModuleId?: string;
  directModuleUrl?: string;
  trackedRequestIds: string[];
  wrapperCount: number;
  anomalies: string[];
  hints: string[];
}

/**
 * Self-contained Vite plugin that resolves and serves externalized Angular
 * component stylesheets (`?ngcomp=...`) from the shared `AngularBuildContext`
 * stylesheet registry and refreshes served records on source CSS edits.
 */
export function componentStylesPlugin(
  ctxOrOptions?: AngularBuildContext | AngularBuildContextOptions,
): Plugin {
  const ctx = ensureAngularBuildContext(ctxOrOptions);

  return {
    name: '@analogjs/vite-plugin-angular:component-styles',
    enforce: 'pre',
    async configResolved(config) {
      await ctx.resolveConfig(config);
    },
    resolveId(id) {
      return ctx.styles.resolveComponentStyleId(id);
    },
    load(id) {
      return ctx.styles.loadComponentStyle(id);
    },
    handleHotUpdate(hmrCtx) {
      if (/\.(css|less|sass|scss)$/.test(hmrCtx.file)) {
        debugHmr('stylesheet file changed', { file: hmrCtx.file });
        ctx.styles.refreshForFile(hmrCtx.file);
      }
      return undefined;
    },
  };
}

export function markModuleSelfAccepting(mod: ModuleNode): ModuleNode {
  // support Vite 6
  if ('_clientModule' in mod) {
    (mod as unknown as { _clientModule: { isSelfAccepting: boolean } })[
      '_clientModule'
    ].isSelfAccepting = true;
  }

  return {
    ...mod,
    isSelfAccepting: true,
  } as ModuleNode;
}

/**
 * Returns every live Vite module that can legitimately represent a changed
 * Angular resource file.
 *
 * For normal files, `getModulesByFile()` is enough. For Angular component
 * stylesheets, it is not: the browser often holds virtual hashed requests
 * (`/abc123.css?direct&ngcomp=...` and `/abc123.css?ngcomp=...`) that are no
 * longer discoverable from the original source path alone. We therefore merge:
 * - watcher event modules
 * - module-graph modules by source file
 * - registry-tracked live request ids resolved back through the module graph
 */
export async function getModulesForChangedFile(
  server: ViteDevServer,
  file: string,
  eventModules: readonly ModuleNode[] = [],
  stylesheetRegistry?: AnalogStylesheetRegistry,
): Promise<ModuleNode[]> {
  const normalizedFile = normalizePath(file.split('?')[0]);
  const modules = new Map<string, ModuleNode>();

  for (const mod of eventModules) {
    if (mod.id) {
      modules.set(mod.id, mod);
    }
  }

  server.moduleGraph.getModulesByFile(normalizedFile)?.forEach((mod) => {
    if (mod.id) {
      modules.set(mod.id, mod);
    }
  });

  const stylesheetRequestIds =
    stylesheetRegistry?.getRequestIdsForSource(normalizedFile) ?? [];
  const requestIdHits: Array<{
    requestId: string;
    candidate: string;
    via: 'url' | 'id';
    moduleId?: string;
  }> = [];
  for (const requestId of stylesheetRequestIds) {
    const candidates = [
      requestId,
      requestId.startsWith('/') ? requestId : `/${requestId}`,
    ];

    for (const candidate of candidates) {
      // `getModuleByUrl()` is the important lookup here. Angular's wrapper
      // module is served by URL and can be absent from a straight `getModuleById`
      // lookup during CSS HMR, even though it is the browser-visible module
      // that must be refreshed. We keep `getModuleById()` as a compatibility
      // fallback for the simpler direct CSS case.
      const mod =
        (await server.moduleGraph.getModuleByUrl(candidate)) ??
        server.moduleGraph.getModuleById(candidate);
      requestIdHits.push({
        requestId,
        candidate,
        via: mod?.url === candidate ? 'url' : 'id',
        moduleId: mod?.id ?? undefined,
      });
      if (mod?.id) {
        modules.set(mod.id, mod);
      }
    }
  }

  debugHmrV('getModulesForChangedFile registry lookup', {
    file: normalizedFile,
    stylesheetRequestIds,
    requestIdHits,
    resolvedModuleIds: [...modules.keys()],
  });

  return [...modules.values()];
}

export function isModuleForChangedResource(
  mod: ModuleNode,
  changedFile: string,
  stylesheetRegistry?: AnalogStylesheetRegistry,
): boolean {
  const normalizedChangedFile = normalizePath(changedFile.split('?')[0]);

  if (normalizePath((mod.file ?? '').split('?')[0]) === normalizedChangedFile) {
    return true;
  }

  if (!mod.id) {
    return false;
  }

  // Virtual Angular stylesheet modules do not report the original source file
  // as `mod.file`; they point at the served hashed stylesheet asset instead.
  // Recover the source file through the stylesheet registry so HMR can still
  // answer "does this live module belong to the resource that just changed?"
  const requestPath = getFilenameFromPath(mod.id);
  const sourcePath =
    stylesheetRegistry?.resolveExternalSource(requestPath) ??
    stylesheetRegistry?.resolveExternalSource(requestPath.replace(/^\//, '')) ??
    stylesheetRegistry?.getServedSourcePath(requestPath) ??
    stylesheetRegistry?.getServedSourcePath(requestPath.replace(/^\//, ''));

  return (
    normalizePath((sourcePath ?? '').split('?')[0]) === normalizedChangedFile
  );
}

function resolveDirectStylesheetSourcePath(
  normalizedFile: string,
  directModule: ModuleNode,
  stylesheetRegistry?: AnalogStylesheetRegistry,
): { directRequestPath?: string; sourcePath: string | undefined } {
  const directRequestPath = directModule.id
    ? getFilenameFromPath(directModule.id)
    : undefined;
  const sourcePath = directRequestPath
    ? (stylesheetRegistry?.resolveExternalSource(directRequestPath) ??
      stylesheetRegistry?.resolveExternalSource(
        directRequestPath.replace(/^\//, ''),
      ) ??
      stylesheetRegistry?.getServedSourcePath(directRequestPath) ??
      stylesheetRegistry?.getServedSourcePath(
        directRequestPath.replace(/^\//, ''),
      ))
    : normalizedFile;

  return { directRequestPath, sourcePath };
}

export function diagnoseComponentStylesheetPipeline(
  changedFile: string,
  directModule: ModuleNode,
  stylesheetRegistry: AnalogStylesheetRegistry | undefined,
  wrapperModules: ModuleNode[],
  stylePreprocessor?: StylePreprocessor,
): ComponentStylesheetPipelineDiagnosis {
  const normalizedFile = normalizePath(changedFile.split('?')[0]);
  const sourceExists = existsSync(normalizedFile);
  const sourceCode = sourceExists
    ? readFileSync(normalizedFile, 'utf-8')
    : undefined;

  const { directRequestPath, sourcePath } = resolveDirectStylesheetSourcePath(
    normalizedFile,
    directModule,
    stylesheetRegistry,
  );
  const registryCode = directRequestPath
    ? stylesheetRegistry?.getServedContent(directRequestPath)
    : undefined;
  const trackedRequestIds =
    stylesheetRegistry?.getRequestIdsForSource(sourcePath ?? '') ?? [];
  const dependencies =
    stylesheetRegistry?.getDependenciesForSource(sourcePath ?? '') ?? [];
  const diagnostics =
    stylesheetRegistry?.getDiagnosticsForSource(sourcePath ?? '') ?? [];
  const tags = stylesheetRegistry?.getTagsForSource(sourcePath ?? '') ?? [];

  const anomalies: string[] = [];
  const hints: string[] = [];

  if (!sourceExists) {
    anomalies.push('source_file_missing');
    hints.push(
      'The stylesheet watcher fired for a file that no longer exists on disk.',
    );
  }

  if (!registryCode) {
    anomalies.push('registry_content_missing');
    hints.push(
      'The stylesheet registry has no served content for the direct module request path.',
    );
  }

  const registryDescription = registryCode
    ? describeStylesheetContent(registryCode)
    : undefined;
  let sourceDescription:
    | ReturnType<typeof describeStylesheetContent>
    | undefined;

  if (sourceCode !== undefined) {
    try {
      // Compare against the same served representation that the registry stores,
      // not the raw file on disk. Analog intentionally prepends `@reference`
      // and rewrites relative imports before the stylesheet reaches Vite, so a
      // raw-source hash comparison would flag a false positive on every healthy
      // update.
      let expectedRegistryCode = preprocessStylesheet(
        sourceCode,
        normalizedFile,
        stylePreprocessor,
      );
      expectedRegistryCode = rewriteRelativeCssImports(
        expectedRegistryCode,
        normalizedFile,
      );
      sourceDescription = describeStylesheetContent(expectedRegistryCode);
    } catch {
      anomalies.push('source_preprocess_failed');
      hints.push(
        'Diagnostic preprocessing of the source stylesheet failed; falling back to raw source summary.',
      );
      sourceDescription = describeStylesheetContent(sourceCode);
    }
  }

  if (
    sourceDescription &&
    registryDescription &&
    !anomalies.includes('source_preprocess_failed') &&
    sourceDescription.digest !== registryDescription.digest
  ) {
    anomalies.push('source_registry_mismatch');
    hints.push(
      'The source file changed, but the served stylesheet content in the registry is still stale.',
    );
  }

  if (trackedRequestIds.length === 0) {
    anomalies.push('no_tracked_requests');
    hints.push(
      'No live stylesheet requests are tracked for this source file, so HMR has no browser-facing target.',
    );
  }

  if (
    trackedRequestIds.some((id) => id.includes('?ngcomp=')) &&
    wrapperModules.length === 0
  ) {
    anomalies.push('tracked_wrapper_missing_from_module_graph');
    hints.push(
      'A wrapper request id is known, but Vite did not expose a live wrapper module during this HMR pass.',
    );
  }

  if (
    trackedRequestIds.every((id) => !id.includes('?ngcomp=')) &&
    wrapperModules.length === 0
  ) {
    anomalies.push('wrapper_not_yet_tracked');
    hints.push(
      'Only direct stylesheet requests were tracked during this HMR pass; the wrapper request may be appearing too late.',
    );
  }

  return {
    file: changedFile,
    sourcePath,
    source: sourceDescription,
    registry: registryDescription,
    dependencies,
    diagnostics,
    tags,
    directModuleId: directModule.id ?? undefined,
    directModuleUrl: directModule.url,
    trackedRequestIds,
    wrapperCount: wrapperModules.length,
    anomalies,
    hints,
  };
}

export async function findComponentStylesheetWrapperModules(
  server: ViteDevServer,
  changedFile: string,
  directModule: ModuleNode,
  fileModules: ModuleNode[],
  stylesheetRegistry?: AnalogStylesheetRegistry,
): Promise<ModuleNode[]> {
  const wrapperModules = new Map<string, ModuleNode>();

  // Fast path: if the wrapper JS module is already present in the resolved
  // fileModules set for this HMR cycle, use it directly.
  for (const mod of fileModules) {
    if (
      mod.id &&
      mod.type === 'js' &&
      isComponentStyleSheet(mod.id) &&
      isModuleForChangedResource(mod, changedFile, stylesheetRegistry)
    ) {
      wrapperModules.set(mod.id, mod);
    }
  }

  const directRequestIds = new Set<string>();
  if (directModule.id) {
    directRequestIds.add(directModule.id);
  }
  if (directModule.url) {
    directRequestIds.add(directModule.url);
  }

  const requestPath = directModule.id
    ? getFilenameFromPath(directModule.id)
    : undefined;
  const sourcePath = requestPath
    ? (stylesheetRegistry?.resolveExternalSource(requestPath) ??
      stylesheetRegistry?.resolveExternalSource(
        requestPath.replace(/^\//, ''),
      ) ??
      stylesheetRegistry?.getServedSourcePath(requestPath) ??
      stylesheetRegistry?.getServedSourcePath(requestPath.replace(/^\//, '')))
    : undefined;

  // HMR timing matters here. On a pure CSS edit, the browser often already has
  // the `?ngcomp=...` wrapper module loaded, but the registry may only know
  // about the `?direct&ngcomp=...` request at the moment the file watcher
  // fires. Pull in any already-tracked wrapper ids for the same source file,
  // then derive wrapper candidates from the known direct request ids.
  for (const requestId of stylesheetRegistry?.getRequestIdsForSource(
    sourcePath ?? '',
  ) ?? []) {
    if (requestId.includes('?ngcomp=')) {
      directRequestIds.add(requestId);
    }
  }

  const candidateWrapperIds = [...directRequestIds]
    .filter((id) => id.includes('?direct&ngcomp='))
    .map((id) => id.replace('?direct&ngcomp=', '?ngcomp='));

  const lookupHits: Array<{
    candidate: string;
    via?: 'url' | 'id';
    moduleId?: string;
    moduleType?: string;
  }> = [];

  for (const candidate of candidateWrapperIds) {
    // Wrapper modules are served by URL and can be absent from a straight
    // module-id lookup during HMR. Prefer URL resolution first, then fall back
    // to id lookup for compatibility with simpler module graph states.
    const mod =
      (await server.moduleGraph.getModuleByUrl(candidate)) ??
      server.moduleGraph.getModuleById(candidate);
    lookupHits.push({
      candidate,
      via: mod?.url === candidate ? 'url' : mod ? 'id' : undefined,
      moduleId: mod?.id ?? undefined,
      moduleType: mod?.type,
    });
    if (
      mod?.id &&
      mod.type === 'js' &&
      isComponentStyleSheet(mod.id) &&
      isModuleForChangedResource(mod, changedFile, stylesheetRegistry)
    ) {
      wrapperModules.set(mod.id, mod);
    }
  }

  debugHmrV('component stylesheet wrapper lookup', {
    file: changedFile,
    sourcePath,
    directModuleId: directModule.id,
    directModuleUrl: directModule.url,
    candidateWrapperIds,
    lookupHits,
  });

  if (wrapperModules.size === 0) {
    debugHmrV('component stylesheet wrapper lookup empty', {
      file: changedFile,
      sourcePath,
      directModuleId: directModule.id,
      directModuleUrl: directModule.url,
      candidateWrapperIds,
    });
  }

  return [...wrapperModules.values()];
}

export function findTemplateOwnerModules(
  server: ViteDevServer,
  resourceFile: string,
): ModuleNode[] {
  const normalizedResourceFile = normalizePath(resourceFile.split('?')[0]);
  const candidateTsFiles = [
    normalizedResourceFile.replace(/\.(html|htm)$/i, '.ts'),
  ];

  const modules = new Map<string, ModuleNode>();
  for (const candidate of candidateTsFiles) {
    const owners = server.moduleGraph.getModulesByFile(candidate);
    owners?.forEach((mod) => {
      if (mod.id) {
        modules.set(mod.id, mod);
      }
    });
  }

  return [...modules.values()];
}

function sendCssUpdate(
  server: ViteDevServer,
  update: {
    path: string;
    acceptedPath: string;
  },
): void {
  const timestamp = Date.now();
  debugHmrV('ws send: css-update', {
    ...update,
    timestamp,
  });
  server.ws.send({
    type: 'update',
    updates: [
      {
        type: 'css-update',
        timestamp,
        path: update.path,
        acceptedPath: update.acceptedPath,
      },
    ],
  });
}

function sendFullReload(
  server: ViteDevServer,
  details: Record<string, unknown>,
): void {
  debugHmrV('ws send: full-reload', details);
  server.ws.send('analog:debug-full-reload', details);
  server.ws.send({ type: 'full-reload' });
}

type ComponentStylesheetHmrOutcome = 'css-update' | 'full-reload';

function logComponentStylesheetHmrOutcome(details: {
  file: string;
  encapsulation: string | undefined;
  diagnosis: ComponentStylesheetPipelineDiagnosis;
  outcome: ComponentStylesheetHmrOutcome;
  directModuleId?: string;
  wrapperIds?: string[];
}): void {
  const pitfalls: string[] = [];
  const rejectedPreferredPaths: string[] = [];
  const hints: string[] = [];

  if (details.encapsulation === 'shadow') {
    pitfalls.push('shadow-encapsulation');
    rejectedPreferredPaths.push('css-update');
    hints.push(
      'Shadow DOM styles cannot rely on Vite CSS patching because Angular applies them inside a shadow root.',
    );
  }

  if (details.diagnosis.anomalies.includes('wrapper_not_yet_tracked')) {
    pitfalls.push('wrapper-not-yet-tracked');
    rejectedPreferredPaths.push('css-update');
    hints.push(
      'The direct stylesheet module exists, but the browser-visible Angular wrapper module was not available in the live graph during this HMR pass.',
    );
  }

  if (
    details.diagnosis.anomalies.includes(
      'tracked_wrapper_missing_from_module_graph',
    )
  ) {
    pitfalls.push('tracked-wrapper-missing-from-module-graph');
    rejectedPreferredPaths.push('css-update');
    hints.push(
      'A wrapper request id is known, but Vite could not resolve a live wrapper module for targeted CSS HMR.',
    );
  }

  debugHmrV('component stylesheet hmr outcome', {
    file: details.file,
    outcome: details.outcome,
    encapsulation: details.encapsulation,
    directModuleId: details.directModuleId,
    wrapperIds: details.wrapperIds ?? [],
    preferredPath:
      details.encapsulation === 'shadow' ? 'full-reload' : 'css-update',
    rejectedPreferredPaths: [...new Set(rejectedPreferredPaths)],
    pitfalls: [...new Set(pitfalls)],
    anomalies: details.diagnosis.anomalies,
    hints: [...new Set([...details.diagnosis.hints, ...hints])],
  });
}

export async function handleDirectComponentStyleHmr(options: {
  server: ViteDevServer;
  file: string;
  directModule: ModuleNode;
  fileModules: ModuleNode[];
  stylesheetRegistry?: AnalogStylesheetRegistry;
  stylePreprocessor?: StylePreprocessor;
}): Promise<ModuleNode[]> {
  const {
    server,
    file,
    directModule,
    fileModules,
    stylesheetRegistry,
    stylePreprocessor,
  } = options;
  const { encapsulation } = getComponentStyleSheetMeta(directModule.id!);

  // Angular exposes one component stylesheet through two module shapes:
  // 1. a `?direct&ngcomp=...` CSS module that Vite can patch with a normal `css-update`
  // 2. a `?ngcomp=...` JS wrapper module that embeds `__vite__css` for Angular's runtime
  //
  // Value: invalidate the browser-visible wrapper before patching the direct CSS
  // module so Angular re-evaluates the same live wrapper it is actually using.
  const wrapperModules = await findComponentStylesheetWrapperModules(
    server,
    file,
    directModule,
    fileModules,
    stylesheetRegistry,
  );
  const normalizedFile = normalizePath(file.split('?')[0]);
  const { sourcePath } = resolveDirectStylesheetSourcePath(
    normalizedFile,
    directModule,
    stylesheetRegistry,
  );
  const trackedRequestIds =
    stylesheetRegistry?.getRequestIdsForSource(sourcePath ?? '') ?? [];

  let stylesheetDiagnosis: ComponentStylesheetPipelineDiagnosis | undefined;
  if (debugHmrV.enabled) {
    try {
      stylesheetDiagnosis = diagnoseComponentStylesheetPipeline(
        file,
        directModule,
        stylesheetRegistry,
        wrapperModules,
        stylePreprocessor,
      );
    } catch (error) {
      debugHmrV('component stylesheet pipeline diagnosis failed', {
        file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  debugStylesV('HMR: component stylesheet changed', {
    file: directModule.file,
    encapsulation,
  });
  debugHmrV('component stylesheet wrapper modules', {
    file,
    wrapperCount: wrapperModules.length,
    wrapperIds: wrapperModules.map((mod) => mod.id),
    availableModuleIds: fileModules.map((mod) => mod.id),
  });
  if (stylesheetDiagnosis) {
    debugHmrV('component stylesheet pipeline diagnosis', stylesheetDiagnosis);
  }

  // Drop Vite's cached direct-module transform before wrapper lookup and patching continue.
  server.moduleGraph.invalidateModule(directModule);
  debugHmrV('component stylesheet direct module invalidated', {
    file,
    directModuleId: directModule.id,
    directModuleUrl: directModule.url,
    reason:
      'Ensure Vite drops stale direct CSS transform results before wrapper or fallback handling continues.',
  });

  // CSS-only HMR is safe only when the browser-visible wrapper is known and the
  // component is not using Shadow DOM.
  const trackedWrapperRequestIds = trackedRequestIds.filter((id) =>
    id.includes('?ngcomp='),
  );
  const canUseCssUpdate =
    encapsulation !== 'shadow' &&
    (wrapperModules.length > 0 || trackedWrapperRequestIds.length > 0);

  if (canUseCssUpdate) {
    wrapperModules.forEach((mod) => server.moduleGraph.invalidateModule(mod));
    debugHmrV('sending css-update for component stylesheet', {
      file,
      path: directModule.url,
      acceptedPath: directModule.file,
      wrapperCount: wrapperModules.length,
      trackedWrapperRequestIds,
      hint:
        wrapperModules.length > 0
          ? 'Live wrapper modules were found and invalidated before sending the CSS update.'
          : 'No live wrapper ModuleNode was available, but the wrapper request id is already tracked, so Analog is trusting the browser-visible wrapper identity and patching the direct stylesheet instead of forcing a reload.',
    });
    sendCssUpdate(server, {
      path: directModule.url,
      acceptedPath: directModule.file!,
    });
    if (stylesheetDiagnosis) {
      logComponentStylesheetHmrOutcome({
        file,
        encapsulation,
        diagnosis: stylesheetDiagnosis,
        outcome: 'css-update',
        directModuleId: directModule.id ?? undefined,
        wrapperIds: wrapperModules
          .map((mod) => mod.id)
          .filter((id): id is string => id !== null),
      });
    }

    return union(
      fileModules
        .filter((mod) => {
          // Component stylesheets will have 2 modules (*.component.scss and *.component.scss?direct&ngcomp=xyz&e=x)
          // We remove the module with the query params to prevent vite double logging the stylesheet name
          return mod.file !== file || mod.id !== directModule.id;
        })
        .map((mod) => {
          if (mod.file === file) {
            return markModuleSelfAccepting(mod);
          }
          return mod;
        }) as ModuleNode[],
      wrapperModules.map((mod) => markModuleSelfAccepting(mod)),
    );
  }

  // If the browser-visible `?ngcomp=...` wrapper cannot be trusted, prefer
  // correctness over a partial patch and reload.
  debugHmrV('component stylesheet hmr fallback: full reload', {
    file,
    encapsulation,
    reason:
      trackedWrapperRequestIds.length === 0
        ? 'missing-wrapper-module'
        : encapsulation === 'shadow'
          ? 'shadow-encapsulation'
          : 'tracked-wrapper-still-not-patchable',
    directId: directModule.id,
    trackedRequestIds: stylesheetRegistry?.getRequestIdsForSource(file) ?? [],
  });
  if (stylesheetDiagnosis) {
    logComponentStylesheetHmrOutcome({
      file,
      encapsulation,
      diagnosis: stylesheetDiagnosis,
      outcome: 'full-reload',
      directModuleId: directModule.id ?? undefined,
      wrapperIds: wrapperModules
        .map((mod) => mod.id)
        .filter((id): id is string => id !== null),
    });
  }
  sendFullReload(server, {
    file,
    encapsulation,
    reason:
      wrapperModules.length === 0
        ? 'missing-wrapper-module'
        : 'shadow-encapsulation',
    directId: directModule.id,
    trackedRequestIds: stylesheetRegistry?.getRequestIdsForSource(file) ?? [],
  });
  return [];
}
