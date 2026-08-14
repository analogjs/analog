import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute } from 'node:path';
import { normalizePath, Plugin, ResolvedConfig } from 'vite';
import {
  inspectCssTailwindDirectives,
  throwTailwindReferenceTextError,
} from './utils/tailwind-reference.js';
import { debugTailwind, debugTailwindV } from './utils/debug.js';
import { composeStylePreprocessors } from './style-preprocessor.js';
import type { StylePreprocessor } from './style-preprocessor.js';
import { stylePipelinePreprocessorFromPlugins } from './style-pipeline.js';
import type { AngularStylePipelineOptions } from './style-pipeline.js';

export interface TailwindCssOptions {
  rootStylesheet: string;
  prefixes?: string[];
}

export interface TailwindReferencePluginOptions {
  tailwindCss?: TailwindCssOptions;
}

/**
 * Core injection logic shared by both the Vite pre-transform plugin and the
 * Angular style preprocessor. Returns the `@reference`-prepended CSS when
 * injection is needed, or `undefined` when the file should be left alone.
 */
function injectTailwindReference(
  code: string,
  opts: {
    rootStylesheet: string;
    prefixes?: string[];
    fileId: string;
  },
): string | undefined {
  const directiveState = inspectCssTailwindDirectives(code);

  if (
    directiveState.hasReferenceDirective ||
    directiveState.hasTailwindImportDirective
  ) {
    return undefined;
  }

  const needsRef = opts.prefixes
    ? opts.prefixes.some((p) => directiveState.commentlessCode.includes(p))
    : directiveState.commentlessCode.includes('@apply');

  if (!needsRef) {
    return undefined;
  }

  if (directiveState.hasReferenceText) {
    throwTailwindReferenceTextError(opts.fileId, opts.rootStylesheet);
  }

  return `@reference "${opts.rootStylesheet.replace(/\\/g, '/')}";\n${code}`;
}

export function tailwindReferencePlugin(
  options: TailwindReferencePluginOptions,
): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular:tailwind-reference',
    enforce: 'pre',
    transform(code: string, id: string) {
      const tw = options.tailwindCss;
      if (!tw || !id.includes('.css')) return;

      const cleanId = id.split('?')[0];
      if (cleanId === tw.rootStylesheet) return;

      // Skip entry stylesheets that @import the root config
      const rootBasename = basename(tw.rootStylesheet);
      const directiveState = inspectCssTailwindDirectives(code);
      if (directiveState.commentlessCode.includes(rootBasename)) return;

      const result = injectTailwindReference(code, {
        rootStylesheet: tw.rootStylesheet,
        prefixes: tw.prefixes,
        fileId: id,
      });

      if (result) {
        debugTailwind('injected @reference via pre-transform', {
          id: id.split('/').slice(-2).join('/'),
        });
      }

      return result;
    },
  };
}

/**
 * Builds a resolved stylePreprocessor function from plugin options.
 *
 * When `tailwindCss` is configured, creates an injector that prepends
 * `@reference "<rootStylesheet>"` into component CSS that uses Tailwind
 * utilities. Uses absolute paths because Angular's externalRuntimeStyles
 * serves component CSS as virtual modules (hash-based IDs) with no
 * meaningful directory — relative paths can't resolve from a hash.
 *
 * If both `tailwindCss` and `stylePreprocessor` are provided, they are
 * chained: Tailwind reference injection runs first, then the user's
 * custom preprocessor.
 */
export function buildStylePreprocessor(options?: {
  stylePreprocessor?: StylePreprocessor;
  stylePipeline?: AngularStylePipelineOptions;
  tailwindCss?: TailwindCssOptions;
}): StylePreprocessor | undefined {
  const userPreprocessor = options?.stylePreprocessor;
  const stylePipelinePreprocessor = stylePipelinePreprocessorFromPlugins(
    options?.stylePipeline,
  );
  const tw = options?.tailwindCss;

  if (!tw && !userPreprocessor && !stylePipelinePreprocessor) {
    return undefined;
  }

  let tailwindPreprocessor:
    | ((code: string, filename: string) => string)
    | undefined;

  if (tw) {
    const rootStylesheet = tw.rootStylesheet;
    const prefixes = tw.prefixes;
    debugTailwind('configured', { rootStylesheet, prefixes });

    if (!existsSync(rootStylesheet)) {
      console.warn(
        `[@analogjs/vite-plugin-angular] tailwindCss.rootStylesheet not found ` +
          `at "${rootStylesheet}". @reference directives will point to a ` +
          `non-existent file, which will cause Tailwind CSS errors. ` +
          `Ensure the path is absolute and the file exists.`,
      );
    }

    tailwindPreprocessor = (code: string, filename: string): string => {
      const result = injectTailwindReference(code, {
        rootStylesheet,
        prefixes,
        fileId: filename,
      });

      if (result) {
        debugTailwind('injected @reference via preprocessor', { filename });
        return result;
      }

      debugTailwindV('skip (no injection needed)', { filename });
      return code;
    };
  }

  if (tailwindPreprocessor && (stylePipelinePreprocessor || userPreprocessor)) {
    debugTailwind('chained with style pipeline or user stylePreprocessor');
  }

  return composeStylePreprocessors([
    tailwindPreprocessor,
    stylePipelinePreprocessor,
    userPreprocessor,
  ]);
}

/**
 * Validates the Tailwind CSS integration configuration and emits actionable
 * warnings for common misconfigurations that cause silent failures.
 */
export function validateTailwindConfig(
  tailwindCss: TailwindCssOptions | undefined,
  config: ResolvedConfig,
  isWatchMode: boolean,
): void {
  const PREFIX = '[@analogjs/vite-plugin-angular]';
  const tw = tailwindCss;

  if (!tw) return;

  if (!isAbsolute(tw.rootStylesheet)) {
    console.warn(
      `${PREFIX} tailwindCss.rootStylesheet must be an absolute path. ` +
        `Got: "${tw.rootStylesheet}". Use path.resolve(__dirname, '...') ` +
        `in your vite.config to convert it.`,
    );
  }

  const resolvedPlugins = config.plugins;
  const hasTailwindPlugin = resolvedPlugins.some(
    (p) =>
      p.name.startsWith('@tailwindcss/vite') ||
      p.name.startsWith('tailwindcss'),
  );

  if (isWatchMode && !hasTailwindPlugin) {
    throw new Error(
      `${PREFIX} tailwindCss is configured but no @tailwindcss/vite ` +
        `plugin was found. Component CSS with @apply directives will ` +
        `not be processed.\n\n` +
        `  Fix: npm install @tailwindcss/vite --save-dev\n` +
        `  Then add tailwindcss() to your vite.config plugins array.\n`,
    );
  }

  if (isWatchMode && tw.rootStylesheet) {
    const projectRoot = normalizePath(config.root);
    const normalizedRootStylesheet = normalizePath(tw.rootStylesheet);
    if (!normalizedRootStylesheet.startsWith(projectRoot)) {
      const fsAllow = config.server?.fs?.allow ?? [];
      const isAllowed = fsAllow.some((allowed) =>
        normalizedRootStylesheet.startsWith(normalizePath(allowed)),
      );
      if (!isAllowed) {
        console.warn(
          `${PREFIX} tailwindCss.rootStylesheet is outside the Vite ` +
            `project root. The dev server may reject it with 403.\n\n` +
            `  Root: ${projectRoot}\n` +
            `  Stylesheet: ${tw.rootStylesheet}\n\n` +
            `  Fix: server.fs.allow: ['${dirname(tw.rootStylesheet)}']\n`,
        );
      }
    }
  }

  if (tw.prefixes !== undefined && tw.prefixes.length === 0) {
    console.warn(
      `${PREFIX} tailwindCss.prefixes is an empty array. No component ` +
        `stylesheets will receive @reference injection. Either remove ` +
        `the prefixes option (to use @apply detection) or specify your ` +
        `prefixes: ['tw:']\n`,
    );
  }

  if (existsSync(tw.rootStylesheet)) {
    try {
      const rootContent = readFileSync(tw.rootStylesheet, 'utf-8');
      if (
        !rootContent.includes('@import "tailwindcss"') &&
        !rootContent.includes("@import 'tailwindcss'")
      ) {
        console.warn(
          `${PREFIX} tailwindCss.rootStylesheet does not contain ` +
            `@import "tailwindcss". The @reference directive will ` +
            `point to a file without Tailwind configuration.\n\n` +
            `  File: ${tw.rootStylesheet}\n`,
        );
      }
    } catch {
      // Silently skip — existence check already warned in buildStylePreprocessor.
    }
  }
}
