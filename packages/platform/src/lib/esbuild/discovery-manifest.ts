import {
  existsSync,
  mkdirSync,
  readFileSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

const manifestWatchers = new Set<string>();

/**
 * Keeps a manifest file listing the currently discovered files and
 * returns the side-effect import a virtual module prepends to make the
 * manifest a real build input.
 *
 * The Angular builder's watcher only reliably tracks plain files that
 * are build inputs: plugin watchDirs/watchFiles never reach it, and a
 * directory listed as a watch file fires once and then goes dead
 * (watchpack semantics). A recursive fs.watch on the route/content
 * directories rewrites the manifest whenever the discovered file set
 * changes, the changed manifest invalidates the bundle like any other
 * input, and the rebuild re-runs discovery — which is what makes adding
 * or removing a route file rebuild in watch mode and the dev server.
 *
 * Watchers are unref'd so one-shot builds still exit, and deduplicated
 * per manifest path since setup() runs once per esbuild build.
 */
export function setupDiscoveryManifest(
  manifestPath: string,
  dirs: string[],
  discover: () => string[],
): string {
  const writeManifest = () => {
    const content = JSON.stringify(discover().sort());
    try {
      if (readFileSync(manifestPath, 'utf8') === content) {
        return;
      }
    } catch {
      // Missing manifest; fall through to write it.
    }
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, content);
  };

  writeManifest();

  if (!manifestWatchers.has(manifestPath)) {
    manifestWatchers.add(manifestPath);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(writeManifest, 150);
      timer.unref?.();
    };

    for (const dir of dirs.filter((dir) => existsSync(dir))) {
      try {
        watch(dir, { recursive: true }, refresh).unref();
      } catch {
        // Recursive fs.watch unavailable; adds/removes then only appear
        // on the next triggered rebuild.
      }
    }
  }

  return `import ${JSON.stringify(manifestPath)};\n`;
}
