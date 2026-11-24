import type { Plugin } from 'vite';

import {
  createAngularBuildContext,
  type PluginOptions,
} from './angular-build-context.js';
import { composeAngularPlugins } from './compose-angular-plugins.js';

export type { PluginOptions } from './angular-build-context.js';
export {
  createFsWatcherCacheInvalidator,
  evictDeletedFileMetadata,
  getFileMetadata,
  type FileMetadataResult,
} from './ngtsc-compile-plugin.js';
export {
  diagnoseComponentStylesheetPipeline,
  findComponentStylesheetWrapperModules,
  findTemplateOwnerModules,
  getModulesForChangedFile,
  handleDirectComponentStyleHmr,
  isModuleForChangedResource,
  markModuleSelfAccepting,
  type ComponentStylesheetPipelineDiagnosis,
} from './component-styles-plugin.js';
export {
  DiagnosticModes,
  describeStylesheetContent,
  getBrowserModeCliOverride,
  injectViteIgnoreForHmrMetadata,
  isIgnoredHmrFile,
  isTestWatchMode,
  mapTemplateUpdatesToFiles,
  refreshStylesheetRegistryForFile,
  toAngularCompilationFileReplacements,
} from './utils/compilation-shared.js';

export function angular(options?: PluginOptions): Plugin[] {
  const ctx = createAngularBuildContext(options);
  return composeAngularPlugins(ctx);
}
