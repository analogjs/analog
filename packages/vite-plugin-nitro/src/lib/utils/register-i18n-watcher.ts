import { ViteDevServer } from 'vite';

/**
 * Registers a file watcher that triggers a full page reload
 * when translation files are added or modified.
 *
 * Matches files in i18n directories with .json, .xlf, .xmb, or .arb extensions.
 *
 * @param viteServer The Vite development server instance
 */
export function registerI18nWatcher(viteServer: ViteDevServer): void {
  const triggerReload = (path: string) => {
    if (isTranslationFile(path)) {
      viteServer.ws.send({ type: 'full-reload' });
    }
  };

  viteServer.watcher.on('change', triggerReload);
  viteServer.watcher.on('add', triggerReload);
}

/**
 * Checks whether a file path looks like a translation file
 * based on its location in an i18n directory and its extension.
 */
export function isTranslationFile(path: string): boolean {
  return /i18n.*\.(json|xlf|xmb|arb)$/.test(path);
}
