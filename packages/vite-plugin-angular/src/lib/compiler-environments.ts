import type {
  ConfigEnv,
  DevEnvironment,
  Plugin,
  ResolvedConfig,
  UserConfig,
  ViteDevServer,
} from 'vite';
import {
  isCompilerSource,
  stripQuery,
  TS_EXT_REGEX,
} from './utils/module-id.js';
import { normalizePath } from 'vite';
import { readFile } from 'node:fs/promises';
import type { BeforeCompile } from './compiler-session.js';

type Callback<H> = Extract<NonNullable<H>, (...args: never[]) => unknown>;
type HookContext<K extends keyof Plugin> = ThisParameterType<
  Callback<Plugin[K]>
>;
type CompilerEnvironment = Parameters<
  NonNullable<Plugin['applyToEnvironment']>
>[0];

function handler<H extends (...args: never[]) => unknown>(
  hook: H | { handler: H } | undefined,
): H | undefined {
  return typeof hook === 'function' ? hook : hook?.handler;
}

interface Configuration {
  readonly _tag: 'Resolved';
  readonly resolved: ResolvedConfig;
  readonly config: UserConfig;
  readonly env: ConfigEnv;
  readonly context: HookContext<'config'>;
  readonly resolvedContext: HookContext<'configResolved'>;
}

/** Vite 6–8 share plugin objects; Angular mutable state must be per environment. */
export function isolateCompilerEnvironments<P extends Plugin>(
  primary: P,
  create: () => P,
  invalidate?: (
    plugin: P,
    files: readonly string[],
    beforeCompile?: BeforeCompile,
  ) => void | Promise<void>,
  resourceOwners?: (plugin: P, file: string) => readonly string[],
  watchChanges?: (
    plugin: P,
    server: ViteDevServer,
    listener: (file: string) => void,
  ) => void,
  warming?: {
    schedule(plugin: P): void;
    settled(plugin: P): Promise<unknown>;
  },
): Plugin {
  let configuration:
    | Configuration
    | { readonly _tag: 'Initial' }
    | {
        readonly _tag: 'Configured';
        readonly config: UserConfig;
        readonly env: ConfigEnv;
        readonly context: HookContext<'config'>;
      } = { _tag: 'Initial' };
  let serverPhase:
    | { server: ViteDevServer; context: HookContext<'configureServer'> }
    | undefined;
  const selections = new WeakMap<CompilerEnvironment, Promise<Plugin>>();
  const pendingServerChildren = new Set<P>();
  let primaryBuildClaimed = false;
  const usedServerChildren = new Set<P>();
  const client: P = {
    ...primary,
    async handleHotUpdate(ctx) {
      const result = await handler(primary.handleHotUpdate)?.call(this, ctx);
      if (warming && usedServerChildren.size) {
        await warming.settled(primary);
        for (const child of usedServerChildren) warming.schedule(child);
      }
      return result;
    },
  };

  return {
    ...client,
    perEnvironmentStartEndDuringDev: true,
    config(config, env) {
      // A restart resolves configuration before its new server exists. Child
      // compilers must wait for that server, never bind to the closed watcher.
      serverPhase = undefined;
      pendingServerChildren.clear();
      usedServerChildren.clear();
      configuration = { _tag: 'Configured', config, env, context: this };
      return handler(primary.config)?.call(this, config, env);
    },
    async configResolved(resolved) {
      if (configuration._tag !== 'Initial') {
        configuration = {
          ...configuration,
          _tag: 'Resolved',
          resolved,
          resolvedContext: this,
        };
      }
      await handler(primary.configResolved)?.call(this, resolved);
    },
    async configureServer(server) {
      serverPhase = { server, context: this };
      const post = await handler(primary.configureServer)?.call(this, server);
      for (const child of pendingServerChildren)
        await handler(child.configureServer)?.call(this, server);
      pendingServerChildren.clear();
      return post;
    },
    async applyToEnvironment(environment) {
      // Vite 6's dependency scanner is named "client" too. It discovers
      // imports with its own transformer and must never own the live compiler.
      if ('mode' in environment && environment.mode === 'scan') return false;
      if (configuration._tag !== 'Resolved')
        throw new Error(
          'Compiler config and configResolved must run before environment selection',
        );
      const existing = selections.get(environment);
      if (existing) return existing;
      const selected = selectEnvironment(environment, configuration);
      selections.set(environment, selected);
      try {
        return await selected;
      } catch (cause) {
        selections.delete(environment);
        throw cause;
      }
    },
  };

  async function selectEnvironment(
    environment: CompilerEnvironment,
    configuration: Configuration,
  ): Promise<Plugin> {
    const { resolved, env } = configuration;
    // Keep the browser compiler connected to the public HMR middleware.
    const primaryName = resolved.build.ssr ? 'ssr' : 'client';
    if (
      environment.name === primaryName &&
      (env.command === 'serve' || !primaryBuildClaimed)
    ) {
      // The builder can resolve the same shared plugin against several
      // configs before any build starts. A native compiler can belong to
      // only one of those environment objects, even when names repeat.
      if (env.command === 'build') primaryBuildClaimed = true;
      return { ...client, perEnvironmentStartEndDuringDev: true };
    }
    return createEnvironment(environment, configuration);
  }

  async function createEnvironment(
    environment: CompilerEnvironment,
    configuration: Configuration,
  ): Promise<Plugin> {
    const { config, resolved, env, context, resolvedContext } = configuration;
    const child = create();
    const watchedChanges = new Set<string>();
    if (invalidate && watchChanges) {
      const configureServer = handler(child.configureServer);
      child.configureServer = async function (server) {
        const post = await configureServer?.call(this, server);
        watchChanges(child, server, (file) => {
          const live = server.environments[environment.name];
          const resource = /\.(html?|css|s[ac]ss|less)$/.test(file);
          if (live && (resource || TS_EXT_REGEX.test(file))) {
            // Client HMR can await compilation before the server hook runs.
            // Publish server dirtiness at the watcher boundary so requests in
            // that interval cannot reuse stale source or inlined resources.
            invalidate(child, [file], settleTruncatedSource(file));
            if (resource) invalidateResources(live, file, Date.now());
            else live.moduleGraph.onFileChange(normalizePath(file));
            watchedChanges.add(file);
          }
        });
        return post;
      };
    }
    function invalidateResources(
      live: DevEnvironment,
      file: string,
      timestamp: number,
    ) {
      const graph = live.moduleGraph;
      const owners = resourceOwners?.(child, file) ?? [];
      if (owners.length) {
        // A source can have several query variants, or none before lazy loading.
        // Compiler dirtiness still guards the first read of an unloaded owner.
        const modules = owners.flatMap((owner) => [
          ...(graph.getModulesByFile(normalizePath(stripQuery(owner))) ?? []),
        ]);
        const invalidated = new Set<(typeof modules)[number]>();
        // File invalidation also expires pending transforms; HMR timestamps alone
        // let a later SSR request share an in-flight pre-edit transform.
        for (const module of modules)
          graph.invalidateModule(module, invalidated, timestamp);
      } else {
        graph.invalidateAll();
      }
    }

    const environmentConfig: ResolvedConfig = {
      ...resolved,
      ...environment.config,
      build: { ...resolved.build, ...environment.config.build },
    };
    await handler(child.config)?.call(
      context,
      { ...config, build: environmentConfig.build },
      env,
    );
    await handler(child.configResolved)?.call(
      resolvedContext,
      environmentConfig,
    );
    if (serverPhase)
      await handler(child.configureServer)?.call(
        serverPhase.context,
        serverPhase.server,
      );
    else if (env.command === 'serve') pendingServerChildren.add(child);
    // Legacy handleHotUpdate runs only in the client environment. A separate
    // hook keeps server compiler state current without sending browser HMR.
    const isolated = {
      ...child,
      perEnvironmentStartEndDuringDev: true,
    };
    const transform = handler(child.transform);
    if (
      warming &&
      transform &&
      env.command === 'serve' &&
      resolved.mode !== 'test' &&
      resolved.server?.hmr !== false &&
      (environment.config.consumer === 'server' || environment.name === 'ssr')
    ) {
      isolated.transform = {
        ...(typeof child.transform === 'object' ? child.transform : {}),
        async handler(code, id, options) {
          const result = await transform.call(this, code, id, options);
          if (result != null && isCompilerSource(id))
            usedServerChildren.add(child);
          return result;
        },
      };
    }
    if (invalidate) {
      isolated.hotUpdate = async function (ctx) {
        if (watchedChanges.delete(ctx.file)) return;
        const compilation = invalidate(child, [ctx.file]);
        if (/\.(html?|css|s[ac]ss|less)$/.test(ctx.file))
          invalidateResources(this.environment, ctx.file, ctx.timestamp);
        await compilation;
      };
    }
    return isolated;
  }
}

function settleTruncatedSource(file: string): BeforeCompile {
  return async (signal) => {
    try {
      if ((await readFile(file)).byteLength) return;
    } catch (error: any) {
      // Deletions have their own compiler path and must not wait for content.
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    // Editors can expose a zero-byte truncate before completing the write. A
    // normal resource takes no delay; only that observed empty snapshot is
    // polled briefly. A genuinely empty resource is accepted at the bound.
    const deadline = Date.now() + 100;
    while (Date.now() < deadline) {
      await waitForSourceWrite(signal, Math.min(10, deadline - Date.now()));
      try {
        if ((await readFile(file)).byteLength) return;
      } catch (error: any) {
        if (error?.code === 'ENOENT') return;
        throw error;
      }
    }
  };
}

function waitForSourceWrite(signal: AbortSignal, ms: number): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
