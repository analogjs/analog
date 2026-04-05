import { mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import StyleDictionary from 'style-dictionary';
import jitiFactory from 'jiti';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { normalizePath } from 'vite';
import { debugTokens } from './utils/debug.js';

const DEFAULT_MANIFEST_MODULE_ID = 'virtual:analog-design-tokens';
const DEFAULT_CSS_MODULE_ID = 'virtual:analog-design-tokens.css';
const VIRTUAL_FILE_PREFIX = 'virtual:analog-design-tokens/file/';
const RESOLVED_MANIFEST_MODULE_ID = '\0analog:design-tokens:manifest';
const RESOLVED_CSS_MODULE_ID = '\0analog:design-tokens:css';
const RESOLVED_FILE_PREFIX = '\0analog:design-tokens:file/';

export interface DesignTokenOutputMeta {
  inject?: boolean;
  framework?: string | string[];
}

export { DEFAULT_CSS_MODULE_ID, DEFAULT_MANIFEST_MODULE_ID };

export interface DesignTokenFile {
  destination: string;
  format: string;
  filter?: unknown;
  options?: Record<string, unknown> & {
    analog?: DesignTokenOutputMeta;
  };
}

export interface DesignTokenPlatform {
  buildPath?: string;
  files?: DesignTokenFile[];
  [key: string]: unknown;
}

export interface DesignTokensConfig {
  source?: string[];
  include?: string[];
  tokens?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  preprocessors?: string[];
  platforms: Record<string, DesignTokenPlatform>;
  [key: string]: unknown;
}

export interface DesignTokensOptions {
  configFile: string;
  include?: string[];
  injectDefaultCss?: boolean;
  manifestModuleId?: string;
  cssModuleId?: string;
}

export interface DesignTokenOutput {
  id: string;
  order: number;
  platform: string;
  destination: string;
  absolutePath: string;
  relativePath: string;
  rootRelativePath: string;
  inject: boolean;
  framework: string[];
  format: string;
  importId: string | null;
}

interface DesignTokenBuildState {
  configFile: string;
  outDir: string;
  outputs: DesignTokenOutput[];
  injectedCss: string;
  tokenGlobs: string[];
  watchRoots: string[];
}

export function defineDesignTokensConfig<T extends DesignTokensConfig>(
  config: T,
): T {
  return config;
}

export function designTokenCss(id: string): string {
  const normalizedId = normalizePath(id).replace(/^\//, '');
  return `${VIRTUAL_FILE_PREFIX}${normalizedId}`;
}

export function designTokensPlugin(
  options: DesignTokensOptions,
  workspaceRoot?: string,
): Plugin[] {
  const manifestModuleId =
    options.manifestModuleId ?? DEFAULT_MANIFEST_MODULE_ID;
  const cssModuleId = options.cssModuleId ?? DEFAULT_CSS_MODULE_ID;
  let config: ResolvedConfig;
  let server: ViteDevServer | undefined;
  let state: DesignTokenBuildState | undefined;
  let rebuilding: Promise<void> | undefined;

  return [
    {
      name: 'analogjs-design-tokens',
      enforce: 'pre',
      configResolved(resolved) {
        config = resolved;
      },
      async buildStart() {
        await ensureBuilt();
      },
      configureServer(devServer) {
        server = devServer;

        void ensureBuilt().then(() => {
          refreshWatchers();
        });

        devServer.watcher.on('all', (eventName, file) => {
          if (!shouldHandleWatchEvent(eventName, file)) {
            return;
          }

          void rebuildAndReload(eventName, file);
        });
      },
      resolveId(id) {
        if (id === manifestModuleId) {
          return RESOLVED_MANIFEST_MODULE_ID;
        }

        if (id === cssModuleId) {
          return RESOLVED_CSS_MODULE_ID;
        }

        if (id.startsWith(VIRTUAL_FILE_PREFIX)) {
          return `${RESOLVED_FILE_PREFIX}${id.slice(VIRTUAL_FILE_PREFIX.length)}`;
        }

        return null;
      },
      async load(id) {
        await ensureBuilt();

        if (!state) {
          return null;
        }

        if (id === RESOLVED_MANIFEST_MODULE_ID) {
          const outputsByFramework = Object.fromEntries(
            collectOutputsByFramework(state.outputs),
          );
          const injected = state.outputs.filter((output) => output.inject);

          return [
            `export const outputs = ${JSON.stringify(state.outputs)};`,
            `export const injectedOutputs = ${JSON.stringify(injected)};`,
            `export const outputsByFramework = ${JSON.stringify(outputsByFramework)};`,
            `export const cssModuleId = ${JSON.stringify(cssModuleId)};`,
            'export function getOutputsForFramework(framework) {',
            '  return outputsByFramework[framework] ?? [];',
            '}',
            'export default outputs;',
          ].join('\n');
        }

        if (id === RESOLVED_CSS_MODULE_ID) {
          return state.injectedCss;
        }

        if (id.startsWith(RESOLVED_FILE_PREFIX)) {
          const relativePath = id.slice(RESOLVED_FILE_PREFIX.length);
          const output = state.outputs.find(
            (candidate) => candidate.relativePath === relativePath,
          );

          if (!output) {
            return null;
          }

          return await readFile(output.absolutePath, 'utf-8');
        }

        return null;
      },
      async transformIndexHtml() {
        await ensureBuilt();

        if (
          options.injectDefaultCss === false ||
          !state?.outputs.some((o) => o.inject)
        ) {
          return [];
        }

        return [
          {
            tag: 'script',
            attrs: {
              type: 'module',
            },
            children: `import ${JSON.stringify(cssModuleId)};`,
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  ];

  async function ensureBuilt(): Promise<void> {
    rebuilding ??= build();
    await rebuilding;
    rebuilding = undefined;
  }

  async function rebuildAndReload(
    eventName: string,
    file: string,
  ): Promise<void> {
    debugTokens('rebuilding design tokens from watcher event', {
      eventName,
      file,
    });
    await build();
    refreshWatchers();
    invalidateVirtualModules();
    server?.ws.send({ type: 'full-reload' });
  }

  function invalidateVirtualModules(): void {
    if (!server) {
      return;
    }

    for (const id of [
      RESOLVED_MANIFEST_MODULE_ID,
      RESOLVED_CSS_MODULE_ID,
      ...(state?.outputs.map(
        (output) => `${RESOLVED_FILE_PREFIX}${output.relativePath}`,
      ) ?? []),
    ]) {
      const module = server.moduleGraph.getModuleById(id);
      if (module) {
        server.moduleGraph.invalidateModule(module);
      }
    }
  }

  function refreshWatchers(): void {
    if (!server || !state) {
      return;
    }

    server.watcher.add([state.configFile, ...state.tokenGlobs]);
  }

  function shouldHandleWatchEvent(eventName: string, file: string): boolean {
    if (
      !state ||
      (eventName !== 'add' && eventName !== 'change' && eventName !== 'unlink')
    ) {
      return false;
    }

    const normalizedFile = normalizePath(path.resolve(file));
    if (normalizedFile === state.configFile) {
      return true;
    }

    return state.watchRoots.some((root) => normalizedFile.startsWith(root));
  }

  async function build(): Promise<void> {
    const root = workspaceRoot
      ? path.resolve(workspaceRoot)
      : config?.root
        ? path.resolve(config.root)
        : process.cwd();
    const configFile = normalizePath(path.resolve(root, options.configFile));
    const loadedConfig = await loadDesignTokenConfig(configFile);
    const outDir = resolveOutDir(root, configFile);

    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const adaptedConfig = createBuildConfig(loadedConfig, outDir);
    const sd = new StyleDictionary(adaptedConfig as never);
    await sd.buildAllPlatforms();

    const outputs = collectOutputs(adaptedConfig, outDir, root);
    const injectedCss = await readInjectedCss(outputs);
    const tokenGlobs = resolveTokenGlobs(
      loadedConfig,
      configFile,
      options.include,
    );
    const watchRoots = tokenGlobs.map(getWatchRoot);

    state = {
      configFile,
      outDir,
      outputs,
      injectedCss,
      tokenGlobs,
      watchRoots,
    };

    debugTokens('built design token outputs', {
      configFile,
      outDir,
      outputs: outputs.map((output) => ({
        id: output.id,
        platform: output.platform,
        relativePath: output.relativePath,
        inject: output.inject,
        framework: output.framework,
      })),
    });
  }
}

async function loadDesignTokenConfig(
  configFile: string,
): Promise<DesignTokensConfig> {
  const jiti = jitiFactory(import.meta.url, {
    interopDefault: true,
  });
  const loaded = await jiti.import(pathToFileURL(configFile).href);
  const config = loaded?.default ?? loaded;

  if (!config || typeof config !== 'object' || !('platforms' in config)) {
    throw new Error(
      `Invalid design token config at ${configFile}. Expected an object with a "platforms" field.`,
    );
  }

  return config as DesignTokensConfig;
}

function resolveOutDir(root: string, configFile: string): string {
  const hash = createHash('sha256')
    .update(configFile)
    .digest('hex')
    .slice(0, 8);
  const fileStem = path
    .basename(configFile)
    .replace(path.extname(configFile), '');

  return path.resolve(
    root,
    'node_modules/.analog/design-tokens',
    `${fileStem}-${hash}`,
  );
}

function createBuildConfig(
  config: DesignTokensConfig,
  outDir: string,
): DesignTokensConfig {
  const platforms = Object.fromEntries(
    Object.entries(config.platforms).map(([platformName, platformConfig]) => {
      const platformOutDir = resolvePlatformOutDir(
        outDir,
        platformName,
        platformConfig.buildPath,
      );

      return [
        platformName,
        {
          ...platformConfig,
          buildPath: `${normalizePath(platformOutDir)}/`,
        },
      ];
    }),
  );

  return {
    ...config,
    log: {
      verbosity: 'silent',
      ...(typeof config.log === 'object' && config.log ? config.log : {}),
    },
    platforms,
  };
}

function resolvePlatformOutDir(
  outDir: string,
  platformName: string,
  buildPath?: string,
): string {
  const relativeBuildPath =
    typeof buildPath === 'string' && buildPath.length > 0
      ? buildPath
      : `${platformName}/`;

  return path.resolve(outDir, relativeBuildPath);
}

function collectOutputs(
  config: DesignTokensConfig,
  outDir: string,
  root: string,
): DesignTokenOutput[] {
  const outputs: DesignTokenOutput[] = [];
  let order = 0;

  for (const [platformName, platformConfig] of Object.entries(
    config.platforms,
  )) {
    const platformOutDir = resolvePlatformOutDir(
      outDir,
      platformName,
      platformConfig.buildPath,
    );

    for (const fileConfig of platformConfig.files ?? []) {
      const absolutePath = path.resolve(platformOutDir, fileConfig.destination);
      const relativePath = normalizePath(path.relative(outDir, absolutePath));
      const rootRelativePath = normalizePath(path.relative(root, absolutePath));
      const analogOptions = fileConfig.options?.analog;
      const isCssFile = absolutePath.endsWith('.css');
      const framework = normalizeFrameworks(analogOptions?.framework);

      outputs.push({
        id: `${platformName}:${fileConfig.destination}`,
        order: order++,
        platform: platformName,
        destination: fileConfig.destination,
        absolutePath,
        relativePath,
        rootRelativePath,
        inject: isCssFile && analogOptions?.inject !== false,
        framework,
        format: fileConfig.format,
        importId: isCssFile ? designTokenCss(relativePath) : null,
      });
    }
  }

  return outputs;
}

async function readInjectedCss(outputs: DesignTokenOutput[]): Promise<string> {
  const injectedOutputs = outputs.filter((output) => output.inject);
  const cssChunks = await Promise.all(
    injectedOutputs.map(async (output) => {
      const content = existsSync(output.absolutePath)
        ? await readFile(output.absolutePath, 'utf-8')
        : '';

      return `/* ${output.relativePath} */\n${content}`;
    }),
  );

  return cssChunks.join('\n\n');
}

function resolveTokenGlobs(
  config: DesignTokensConfig,
  configFile: string,
  include: string[] = [],
): string[] {
  const configDir = path.dirname(configFile);
  const tokenPatterns = [
    ...(config.include ?? []),
    ...(config.source ?? []),
    ...include,
  ];

  return tokenPatterns.map((pattern) =>
    normalizePath(
      path.resolve(
        isAbsoluteLike(pattern) ? path.parse(pattern).root : configDir,
        pattern,
      ),
    ),
  );
}

function getWatchRoot(pattern: string): string {
  const normalizedPattern = normalizePath(pattern);
  const wildcardIndex = normalizedPattern.search(/[*[{]/);

  if (wildcardIndex === -1) {
    return normalizedPattern;
  }

  const prefix = normalizedPattern.slice(0, wildcardIndex);
  return prefix.endsWith('/')
    ? prefix
    : `${prefix.slice(0, prefix.lastIndexOf('/') + 1)}`;
}

function isAbsoluteLike(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\//.test(value);
}

function normalizeFrameworks(
  framework: string | string[] | undefined,
): string[] {
  if (!framework) {
    return [];
  }

  return Array.isArray(framework) ? framework : [framework];
}

function collectOutputsByFramework(
  outputs: DesignTokenOutput[],
): Map<string, DesignTokenOutput[]> {
  const grouped = new Map<string, DesignTokenOutput[]>();

  for (const output of outputs) {
    for (const framework of output.framework) {
      const current = grouped.get(framework) ?? [];
      current.push(output);
      grouped.set(framework, current);
    }
  }

  return grouped;
}
