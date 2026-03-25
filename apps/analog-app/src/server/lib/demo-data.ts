import { existsSync, readFileSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const DEMO_DATA_DIR = resolve(process.cwd(), 'apps/analog-app/src/server/lib');

export function getDemoDataSourcePath(fileName: string) {
  return resolve(DEMO_DATA_DIR, fileName);
}

export function readNamedArrayFromSource<T>(
  sourcePath: string,
  constName: string,
  fallback: T[],
): T[] {
  if (!existsSync(sourcePath)) {
    return fallback;
  }

  try {
    const source = readFileSync(sourcePath, 'utf8');
    const match = source.match(
      new RegExp(`const\\s+${constName}\\s*:[^=]+?=\\s*(\\[[\\s\\S]*?\\]);`),
    );
    if (!match) {
      return fallback;
    }

    const items = runInNewContext(`(${match[1]})`) as T[];
    return Array.isArray(items) ? items : fallback;
  } catch {
    return fallback;
  }
}

export function watchDemoSourceFile(
  sourcePath: string,
  onChange: () => void | Promise<void>,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const watcher = watch(sourcePath, { persistent: false }, () => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        void onChange();
      }, 50);
    });

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      watcher.close();
    };
  } catch {
    return () => {
      /* noop */
    };
  }
}
