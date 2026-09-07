import type { Plugin } from 'vite';
import type { RegistryEntry } from './compiler/registry-types.js';
import type {
  StylePreprocessor,
  StylesheetRegistryReader,
} from './style-preprocessor.js';
export type TransformFilter = (code: string, id: string) => boolean;

export type ComponentRegistryEntries = ReadonlyMap<string, RegistryEntry>;

export interface StylesheetRegistryContext {
  workspaceRoot: string;
}

export type StylesheetRegistryConfigurator = (
  registry: StylesheetRegistryReader,
  context: StylesheetRegistryContext,
) => void;

/**
 * Narrow framework context handed to a Vite plugin's `analog.setup()` hook.
 * Only grows when a concrete integration needs another seam.
 */
export interface AnalogPluginContext {
  /**
   * Registers a pre-transform that runs on every Angular component stylesheet
   * before it enters Vite's `preprocessCSS` pipeline.
   */
  registerStylePreprocessor(preprocessor: StylePreprocessor): void;
  /**
   * Requests that component styles are externalized in dev and watch mode so
   * they run through Vite's CSS plugin pipeline (for example
   * `@tailwindcss/vite`) instead of being inlined through `preprocessCSS`,
   * which only runs PostCSS and CSS preprocessors. Production builds keep
   * inlining component styles.
   */
  externalizeComponentStyles(): void;
  /**
   * Receives the live stylesheet registry for externalized component styles
   * each time a compilation creates one, so the plugin can map component
   * stylesheet sources to their served ids, dependencies, and diagnostics.
   */
  configureStylesheetRegistry(configure: StylesheetRegistryConfigurator): void;
  /**
   * Restricts which modules Angular compiles. A module is transformed only
   * when every registered filter returns `true` for it.
   */
  registerTransformFilter(filter: TransformFilter): void;
  /**
   * Contributes directive, component, pipe, and NgModule metadata keyed by
   * class name for classes the fast compiler cannot reach through its own
   * tsconfig-driven scan (for example components compiled from another
   * source format). The map is read on every compile, so a plugin may keep
   * filling it after setup.
   */
  registerComponentRegistry(entries: ComponentRegistryEntries): void;
  /**
   * Adds TypeScript include globs to the Angular compilation. Globs resolve
   * against the same workspace root as `angular({ include })`, so a leading
   * `/` means workspace-relative.
   */
  addInclude(globs: string[]): void;
}

export interface AnalogPluginHooks {
  setup?(context: AnalogPluginContext): void | Promise<void>;
}

/**
 * A normal Vite plugin that optionally exposes an `analog` setup hook.
 * Discovery is structural (`plugin.analog?.setup`), so this type is a DX aid
 * rather than a requirement.
 */
export type AnalogIntegrationPlugin = Plugin & { analog?: AnalogPluginHooks };
