/**
 * OXC engine HMR controller.
 *
 * Mirrors the dispatch in `@oxc-angular/vite`'s own Vite plugin: a
 * per-component update protocol that swaps templates and styles via
 * Angular's runtime `ɵɵreplaceMetadata` without re-instantiating the
 * component. Wired into Analog's `fastCompilePlugin` when
 * `fastCompileEngine: 'oxc'` and `liveReload: true`.
 *
 * Responsibilities:
 *  - Track which component classes live in each `.ts` file (populated as
 *    `transformAngularFile` results come back from the OXC engine).
 *  - Cache each component's inline `template:` / `styles:` text plus a
 *    metadata-stripped whole-file snapshot, so a save can be classified
 *    "inline template/styles only" → HMR vs "anything else" → full reload
 *    by a cheap byte-diff.
 *  - Mount the `@ng/component?c=<encoded id>` HTTP middleware that
 *    serves per-component update modules built by OXC's `compileForHmrSync`.
 *  - Run the 4-branch `handleHotUpdate` dispatch (external resource /
 *    component .ts inline-only / component .ts other / plain .ts / fall
 *    through to Vite).
 *
 * Cross-platform note: `normalizePath` is applied throughout so a
 * Windows path with backslashes from Vite's events still matches the
 * forward-slash keys produced by `transformAngularFile`.
 */
import { readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import type {
  Connect,
  HmrContext,
  ModuleNode,
  ResolvedConfig,
  ViteDevServer,
} from 'vite';
import { normalizePath, preprocessCSS } from 'vite';

import {
  extractInlineStyles,
  extractInlineTemplate,
  stripComponentMetadata,
} from './oxc-hmr-helpers.js';

/** Minimal subset of `@oxc-angular/vite/api` the HMR controller uses. */
interface OxcHmrApi {
  compileForHmrSync: (
    template: string,
    componentName: string,
    filePath: string,
    styles?: string[] | null,
    options?: {
      angularVersion?: { major: number; minor: number; patch: number };
    } | null,
  ) => {
    hmrModule: string;
    componentId: string;
    templateJs: string;
    errors: Array<{ message: string }>;
  };
  extractComponentUrls: (
    source: string,
    filename: string,
  ) => Promise<{ templateUrls: string[]; styleUrls: string[] }>;
}

const ANGULAR_COMPONENT_PREFIX = '@ng/component';
const RESOURCE_EXT_RE = /\.(html?|css|scss|sass|less)$/;
const TS_EXT_RE = /\.tsx?$/;

export interface OxcHmrControllerOptions {
  /** Resolved Vite config — passed through to `preprocessCSS` for SCSS/Less styleUrls. */
  resolvedConfig: () => ResolvedConfig | undefined;
  /** Installed `@angular/compiler` version, fed into `compileForHmrSync`. */
  angularVersion: { major: number; minor: number; patch: number };
  /** Lazy-loader for the OXC NAPI surface. */
  loadApi: () => Promise<OxcHmrApi>;
}

export interface OxcHmrController {
  /**
   * Called from the Vite `transform` hook after each successful OXC
   * compile. Records which components live in the file, refreshes the
   * inline-template / inline-styles / stripped-metadata caches, and
   * prunes entries for components that used to be in the file but
   * no longer are.
   */
  recordTransform(
    filePath: string,
    code: string,
    templateUpdates: Record<string, string>,
  ): void;
  /** Register a resource → owning file mapping (templateUrl / styleUrl deps). */
  recordResource(resourcePath: string, ownerFilePath: string): void;
  /** Drop any resource → owner mappings whose owner is no longer `ownerFilePath`. */
  pruneStaleResources(
    ownerFilePath: string,
    currentResources: Iterable<string>,
  ): void;
  /** Register HTTP middleware + WebSocket listeners on the dev server. */
  mountMiddleware(server: ViteDevServer): void;
  /**
   * 4-branch dispatch. Return value follows Vite's `handleHotUpdate`
   * contract: empty array = "I handled it, don't fall back to default
   * HMR"; `undefined` = "let Vite take it from here".
   */
  handleHotUpdate(ctx: HmrContext): Promise<ModuleNode[] | undefined>;
}

export function createOxcHmrController(
  opts: OxcHmrControllerOptions,
): OxcHmrController {
  // ──────────────────────────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────────────────────────

  /** filePath → set of component class names declared in it. */
  const componentsByFile = new Map<string, Set<string>>();
  /** Resource path → owning component .ts path. */
  const resourceToComponent = new Map<string, string>();
  /** `filePath@ClassName` IDs queued for next HMR delivery. */
  const pendingHmrUpdates = new Set<string>();
  /** `filePath@ClassName` → current inline `template:` text (or absent). */
  const inlineTemplateCache = new Map<string, string>();
  /** `filePath@ClassName` → current inline `styles:` literals (or absent). */
  const inlineStylesCache = new Map<string, string[]>();
  /** filePath → whole-file source with every @Component's template/styles fields emptied. */
  const componentMetadataCache = new Map<string, string>();

  let viteServer: ViteDevServer | undefined;

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────

  function refreshComponentCaches(
    filePath: string,
    code: string,
    classNames: Iterable<string>,
  ) {
    for (const className of classNames) {
      const cacheKey = `${filePath}@${className}`;
      const inlineTemplate = extractInlineTemplate(code, className);
      if (inlineTemplate !== null) {
        inlineTemplateCache.set(cacheKey, inlineTemplate);
      } else {
        inlineTemplateCache.delete(cacheKey);
      }
      const inlineStyles = extractInlineStyles(code, className);
      if (inlineStyles !== null) {
        inlineStylesCache.set(cacheKey, inlineStyles);
      } else {
        inlineStylesCache.delete(cacheKey);
      }
    }
    componentMetadataCache.set(filePath, stripComponentMetadata(code));
  }

  function dispatchComponentUpdate(
    componentFile: string,
    className: string,
    server: ViteDevServer,
  ): boolean {
    const classNames = componentsByFile.get(componentFile);
    if (!classNames || !classNames.has(className)) return false;

    const componentId = `${componentFile}@${className}`;
    pendingHmrUpdates.add(componentId);

    // Invalidate the file's module so the next request sees fresh
    // template / style content. One invalidation covers every
    // component in the file.
    const mod = server.moduleGraph.getModuleById(componentFile);
    if (mod) server.moduleGraph.invalidateModule(mod);

    const encodedId = encodeURIComponent(componentId);
    server.ws.send({
      type: 'custom',
      event: 'angular:component-update',
      data: { id: encodedId, timestamp: Date.now() },
    });
    return true;
  }

  function dispatchAllComponentsInFile(
    componentFile: string,
    server: ViteDevServer,
  ): boolean {
    const classNames = componentsByFile.get(componentFile);
    if (!classNames || classNames.size === 0) return false;
    let dispatched = false;
    for (const className of classNames) {
      if (dispatchComponentUpdate(componentFile, className, server))
        dispatched = true;
    }
    return dispatched;
  }

  // ──────────────────────────────────────────────────────────────────
  // Middleware: serve `@ng/component?c=<id>` HMR update modules
  // ──────────────────────────────────────────────────────────────────

  function buildMiddleware(server: ViteDevServer): Connect.HandleFunction {
    return async function angularComponentMiddleware(
      req: Connect.IncomingMessage,
      res: ServerResponse<Connect.IncomingMessage>,
      next: Connect.NextFunction,
    ) {
      if (!req.url?.includes(ANGULAR_COMPONENT_PREFIX)) {
        next();
        return;
      }

      const requestUrl = new URL(req.url, 'http://localhost');
      const componentId = requestUrl.searchParams.get('c');
      if (!componentId) {
        res.statusCode = 400;
        res.end();
        return;
      }

      const decodedComponentId = decodeURIComponent(componentId);
      const atIndex = decodedComponentId.indexOf('@');
      if (atIndex === -1) {
        res.statusCode = 400;
        res.end();
        return;
      }

      const fileId = decodedComponentId.slice(0, atIndex);
      const className = decodedComponentId.slice(atIndex + 1);
      const resolvedId = resolve(process.cwd(), fileId);

      const serveEmpty = () => {
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end('');
      };

      // No pending update → empty response. The browser hits this on
      // initial page load (every component dynamically imports the
      // virtual module once); we don't want to issue a phantom
      // `ɵɵreplaceMetadata` and risk re-instantiating views.
      if (!pendingHmrUpdates.has(decodedComponentId)) {
        serveEmpty();
        return;
      }

      // Stale className (class renamed/removed since the entry was
      // queued) — consume and drop.
      if (!componentsByFile.get(resolvedId)?.has(className)) {
        pendingHmrUpdates.delete(decodedComponentId);
        serveEmpty();
        return;
      }

      try {
        const api = await opts.loadApi();
        const source = await readFileAsync(resolvedId, 'utf-8');
        const { templateUrls, styleUrls } = await api.extractComponentUrls(
          source,
          resolvedId,
        );
        const dir = dirname(resolvedId);

        // Fresh template content — external file or inline.
        let templateContent: string | null = null;
        if (templateUrls.length > 0) {
          templateContent = await readFileAsync(
            resolve(dir, templateUrls[0]),
            'utf-8',
          );
        } else {
          templateContent = extractInlineTemplate(source, className);
        }

        if (!templateContent) {
          // Transient empty (mid-write) or legitimate removal — preserve
          // the pending slot for the next watcher event.
          serveEmpty();
          return;
        }

        // Fresh styles — external (preprocessed) or inline as plain CSS.
        let styles: string[] | null = null;
        if (styleUrls.length > 0) {
          const styleContents: string[] = [];
          const config = opts.resolvedConfig();
          for (const styleUrl of styleUrls) {
            const stylePath = resolve(dir, styleUrl);
            try {
              let styleContent = await readFileAsync(stylePath, 'utf-8');
              if (config) {
                const processed = await preprocessCSS(
                  styleContent,
                  stylePath,
                  config,
                );
                styleContent = processed.code;
              }
              styleContents.push(styleContent);
            } catch {
              // missing styleUrl — skip
            }
          }
          if (styleContents.length > 0) styles = styleContents;
        } else {
          const inlineStyles = extractInlineStyles(source, className);
          if (inlineStyles && inlineStyles.length > 0) styles = inlineStyles;
        }

        const result = api.compileForHmrSync(
          templateContent,
          className,
          resolvedId,
          styles,
          { angularVersion: opts.angularVersion },
        );

        // Compile errors come back STRUCTURED on the result, not as a
        // throw — without this check a broken template would be served
        // as a no-op update module and the browser would silently keep
        // stale content. Fall back via `angular:invalidate` so the
        // runtime requests a full reload, mirroring the catch path
        // below.
        if (result.errors.length > 0) {
          const summary = result.errors
            .map((e) => `[oxc-hmr] ${e.message}`)
            .join('\n');
          console.error(
            `[Angular HMR] ${resolvedId}@${className}:\n${summary}`,
          );
          pendingHmrUpdates.delete(decodedComponentId);
          server.ws.send({
            type: 'custom',
            event: 'angular:invalidate',
            data: {
              id: componentId,
              message: result.errors[0].message,
              error: true,
            },
          });
          serveEmpty();
          return;
        }

        // Consume the pending slot only after we have content to serve —
        // a transient empty during atomic-write truncation resolves on
        // the next watcher event.
        pendingHmrUpdates.delete(decodedComponentId);
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(result.hmrModule);
      } catch (e) {
        const error = e as Error;
        // Consume the slot on failure so we don't loop a broken compile.
        pendingHmrUpdates.delete(decodedComponentId);
        // Fall back to a full reload via the angular:invalidate channel.
        server.ws.send({
          type: 'custom',
          event: 'angular:invalidate',
          data: {
            id: componentId,
            message: error.message,
            error: true,
          },
        });
        serveEmpty();
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────

  return {
    recordTransform(filePath, code, templateUpdates) {
      const normalized = normalizePath(filePath);
      const classNamesInFile = new Set<string>();
      for (const componentId of Object.keys(templateUpdates)) {
        const at = componentId.indexOf('@');
        if (at === -1) continue;
        classNamesInFile.add(componentId.slice(at + 1));
      }

      // Prune entries for classes that USED to be in this file but
      // aren't any more.
      const prev = componentsByFile.get(normalized);
      if (prev) {
        for (const oldClass of prev) {
          if (classNamesInFile.has(oldClass)) continue;
          const staleKey = `${normalized}@${oldClass}`;
          inlineTemplateCache.delete(staleKey);
          inlineStylesCache.delete(staleKey);
          pendingHmrUpdates.delete(staleKey);
        }
      }

      componentsByFile.set(normalized, classNamesInFile);
      refreshComponentCaches(normalized, code, classNamesInFile);
    },

    recordResource(resourcePath, ownerFilePath) {
      resourceToComponent.set(
        normalizePath(resourcePath),
        normalizePath(ownerFilePath),
      );
    },

    pruneStaleResources(ownerFilePath, currentResources) {
      const owner = normalizePath(ownerFilePath);
      const keep = new Set([...currentResources].map((r) => normalizePath(r)));
      for (const [resource, registeredOwner] of resourceToComponent) {
        if (registeredOwner === owner && !keep.has(resource)) {
          resourceToComponent.delete(resource);
        }
      }
    },

    mountMiddleware(server) {
      viteServer = server;

      server.ws.on(
        'angular:invalidate',
        (data: { id: string; message: string; error: boolean }) => {
          console.warn(
            `[Angular HMR] Runtime update failed for ${data.id}: ${data.message}`,
          );
          server.ws.send({ type: 'full-reload', path: '*' });
        },
      );

      server.middlewares.use(buildMiddleware(server));
    },

    async handleHotUpdate(ctx) {
      const server = viteServer;
      if (!server) return undefined;

      const normalizedFile = normalizePath(ctx.file);

      // ── Branch 1: external component resource (templateUrl / styleUrl)
      if (RESOURCE_EXT_RE.test(ctx.file)) {
        if (resourceToComponent.has(normalizedFile)) {
          const componentFile = resourceToComponent.get(normalizedFile)!;
          if (dispatchAllComponentsInFile(componentFile, server)) {
            return [];
          }
        }
        return ctx.modules;
      }

      const isTs = TS_EXT_RE.test(ctx.file);
      const fileClassNames = componentsByFile.get(normalizedFile);

      // ── Branch 2: component .ts (has @Component decorator)
      if (isTs && fileClassNames && fileClassNames.size > 0) {
        // Bail if a pending update is already queued (an external resource
        // change just invalidated the .ts module via the graph).
        for (const className of fileClassNames) {
          if (pendingHmrUpdates.has(`${normalizedFile}@${className}`)) {
            return [];
          }
        }

        // Stripped-metadata equality test: if the source with every
        // @Component's `template:` and `styles:` fields emptied is
        // byte-identical to the cached snapshot, every change is
        // contained within those fields. Dispatch HMR for all
        // components in the file (Angular's runtime no-ops the
        // unchanged ones).
        const cachedStripped = componentMetadataCache.get(normalizedFile);
        if (cachedStripped !== undefined) {
          let newContent: string;
          try {
            newContent = readFileSync(normalizedFile, 'utf-8');
          } catch {
            newContent = '';
          }
          const newStripped = stripComponentMetadata(newContent);
          if (newStripped === cachedStripped) {
            refreshComponentCaches(normalizedFile, newContent, fileClassNames);
            dispatchAllComponentsInFile(normalizedFile, server);
            return [];
          }
        }

        // Anything else in a component .ts → full reload.
        const componentModule =
          server.moduleGraph.getModuleById(normalizedFile);
        if (componentModule)
          server.moduleGraph.invalidateModule(componentModule);
        server.ws.send({ type: 'full-reload', path: ctx.file });
        return [];
      }

      // ── Branch 3: plain (non-component) .ts outside node_modules → full reload
      if (isTs && !normalizedFile.includes('/node_modules/')) {
        for (const mod of ctx.modules) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload', path: ctx.file });
        return [];
      }

      // ── Branch 4: everything else — let Vite handle it
      return ctx.modules;
    },
  };
}
