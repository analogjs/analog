import { Plugin } from 'vite';

import { angularMajor, angularMinor, angularPatch } from './utils/devkit.js';

/**
 * This plugin is a workaround for the ɵPendingTasks symbol being renamed
 * to ɵPendingTasksInternal in Angular v19.0.4. The symbol is renamed to support previous versions of
 * Angular with Analog that used the ɵPendingTasks symbol.
 *
 * Commmit: https://github.com/angular/angular/commit/24e317cb157bf1ef159ed8554f1b79cb3443edf4
 */
export function pendingTasksPlugin(): Plugin {
  return {
    name: 'analogjs-pending-tasks-plugin',
    transform(code, id) {
      if (
        Number(`${angularMajor}${angularMinor}${angularPatch}`) < 1904 &&
        id.includes('analogjs-content.mjs')
      ) {
        return {
          code: code.replace('ɵPendingTasksInternal', 'ɵPendingTasks'),
        };
      }
      return;
    },
  };
}
