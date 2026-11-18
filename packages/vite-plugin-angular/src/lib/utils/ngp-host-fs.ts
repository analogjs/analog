import * as fs from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import { normalizePath } from 'vite';

interface HostStat {
  isFile: boolean;
  isDir: boolean;
  isSymlink: boolean;
}

interface HostDirEntry extends HostStat {
  name: string;
}

/** The file system NGP's WebAssembly backend reads through (`hostFs`). */
export interface NgpHostFs {
  read(path: string): Uint8Array | null;
  metadata(path: string): HostStat | null;
  symlinkMetadata(path: string): HostStat | null;
  readLink(path: string): string | null;
  canonicalize(path: string): string | null;
  readDir(path: string): HostDirEntry[] | null;
}

const FILE: HostStat = { isFile: true, isDir: false, isSymlink: false };

// The errors NGP's own host treats as a missing file
const NOT_FOUND_CODES = new Set([
  'ENOENT',
  'ENOTDIR',
  'ENAMETOOLONG',
  'EINVAL',
]);

function orNull<T>(read: () => T): T | null {
  try {
    return read();
  } catch (error) {
    if (NOT_FOUND_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
      return null;
    }
    throw error;
  }
}

const canonicalDirs = new Map<string, string>();

/**
 * `path`, normalized, with the symlinks of its directory resolved. Lowered
 * modules are keyed by these paths, whichever path a file is reached by.
 */
export function canonicalPath(path: string): string {
  const normalized = normalizePath(path);
  const dir = posix.dirname(normalized);
  let real = canonicalDirs.get(dir);
  if (real === undefined) {
    real = orNull(() => normalizePath(fs.realpathSync(dir))) ?? dir;
    canonicalDirs.set(dir, real);
  }
  return `${real}/${posix.basename(normalized)}`;
}

function toStat(
  stats: Pick<fs.Stats, 'isFile' | 'isDirectory' | 'isSymbolicLink'>,
): HostStat {
  return {
    isFile: stats.isFile(),
    isDir: stats.isDirectory(),
    isSymlink: stats.isSymbolicLink(),
  };
}

/**
 * The disk, with each module of a source format served as a TypeScript file
 * named after it (`x.tsrx` as `x.tsrx.ts`) and the module itself hidden, so an
 * import of `./x.tsrx` resolves to its TypeScript.
 *
 * @param programCode The TypeScript of a module's program file, by the file's
 *   normalized, canonical path.
 */
export function createNgpHostFs(
  programCode: (path: string) => string | undefined,
): NgpHostFs {
  const programFile = (path: string) => programCode(canonicalPath(path));
  const isHidden = (path: string) =>
    programCode(`${canonicalPath(path)}.ts`) !== undefined;
  const encoder = new TextEncoder();

  return {
    read(path) {
      const code = programFile(path);
      if (code !== undefined) return encoder.encode(code);
      if (isHidden(path)) return null;
      const buffer = orNull(() => fs.readFileSync(path));
      return buffer && new Uint8Array(buffer);
    },
    metadata(path) {
      if (programFile(path) !== undefined) return FILE;
      if (isHidden(path)) return null;
      const stats = orNull(() => fs.statSync(path));
      return stats && toStat(stats);
    },
    symlinkMetadata(path) {
      if (programFile(path) !== undefined) return FILE;
      if (isHidden(path)) return null;
      const stats = orNull(() => fs.lstatSync(path));
      return stats && toStat(stats);
    },
    readLink(path) {
      return orNull(() => fs.readlinkSync(path, 'utf-8'));
    },
    canonicalize(path) {
      if (programFile(path) !== undefined) {
        const dir = orNull(() => fs.realpathSync(dirname(path)));
        return dir && join(dir, basename(path));
      }
      if (isHidden(path)) return null;
      return orNull(() => fs.realpathSync(path));
    },
    readDir(path) {
      const entries = orNull(() =>
        fs.readdirSync(path, { withFileTypes: true }),
      );
      return (
        entries &&
        entries.map((entry) =>
          isHidden(join(path, entry.name))
            ? { ...FILE, name: `${entry.name}.ts` }
            : { ...toStat(entry), name: entry.name },
        )
      );
    },
  };
}
