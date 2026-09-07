import type {
  ConfigEnv,
  DevEnvironment,
  Plugin,
  ResolvedConfig,
  UserConfig,
  ViteDevServer,
} from 'vite';

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
  invalidate?: (plugin: P, files: readonly string[]) => void | Promise<void>,
  resourceOwners?: (plugin: P, file: string) => readonly string[],
  watchResources?: (
    plugin: P,
    server: ViteDevServer,
    listener: (file: string) => void,
  ) => void,
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

  return {
    ...primary,
    perEnvironmentStartEndDuringDev: true,
    config(config, env) {
      // A restart resolves configuration before its new server exists. Child
      // compilers must wait for that server, never bind to the closed watcher.
      serverPhase = undefined;
      pendingServerChildren.clear();
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
      return { ...primary, perEnvironmentStartEndDuringDev: true };
    }
    return createEnvironment(environment, configuration);
  }

  async function createEnvironment(
    environment: CompilerEnvironment,
    configuration: Configuration,
  ): Promise<Plugin> {
    const { config, resolved, env, context, resolvedContext } = configuration;
    const child = create();
    const watchedResources = new Set<string>();
    if (invalidate && watchResources) {
      const configureServer = handler(child.configureServer);
      child.configureServer = async function (server) {
        const post = await configureServer?.call(this, server);
        watchResources(child, server, (file) => {
          const live = server.environments[environment.name];
          if (live && /\.(html?|css|s[ac]ss|less)$/.test(file)) {
            // Client HMR can await compilation before the server hook runs.
            // Publish server dirtiness at the watcher boundary so requests in
            // that interval cannot reuse stale inlined resources.
            invalidate(child, [file]);
            invalidateResources(live, file, Date.now());
            watchedResources.add(file);
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
      const modules = owners.flatMap((owner) => {
        const module = graph.getModuleById(owner);
        return module ? [module] : [];
      });
      if (modules.length === owners.length && modules.length) {
        const invalidated = new Set<(typeof modules)[number]>();
        for (const module of modules)
          graph.invalidateModule(module, invalidated, timestamp, true);
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
    if (invalidate) {
      isolated.hotUpdate = async function (ctx) {
        if (watchedResources.delete(ctx.file)) return;
        const compilation = invalidate(child, [ctx.file]);
        if (/\.(html?|css|s[ac]ss|less)$/.test(ctx.file))
          invalidateResources(this.environment, ctx.file, ctx.timestamp);
        await compilation;
      };
    }
    return isolated;
  }
}
