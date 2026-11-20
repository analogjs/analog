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

const WINDOWS_DRIVE_RE = /^[A-Za-z]:(?:\/|$)/;
const WASM_WINDOWS_DRIVE_RE = /^\/([A-Za-z]:)(\/|$)/;

/**
 * Converts a host path to the POSIX-absolute form NGP's WebAssembly backend
 * expects (`D:\a\b` → `/D:/a/b`). POSIX and relative paths are unchanged.
 */
export function toWasmPath(path: string): string {
  const normalized = normalizePath(path);
  return WINDOWS_DRIVE_RE.test(normalized) ? `/${normalized}` : normalized;
}

/**
 * Converts a path returned by NGP's WebAssembly backend back to a normalized
 * host path (`/D:/a/b` → `D:/a/b`).
 */
export function fromWasmPath(path: string): string {
  const normalized = normalizePath(path);
  return normalized.replace(
    WASM_WINDOWS_DRIVE_RE,
    (_, drive: string, sep: string) => `${drive}${sep || '/'}`,
  );
}

/**
 * The disk, with each module of a source format served as a TypeScript file
 * named after it (`x.tsrx` as `x.tsrx.ts`) and the module itself hidden, so an
 * import of `./x.tsrx` resolves to its TypeScript. Also translates Windows
 * drive paths at the WebAssembly boundary.
 *
 * @param programCode The TypeScript of a module's program file, by the file's
 *   normalized, canonical path.
 */
export function createNgpHostFs(
  programCode?: (path: string) => string | undefined,
): NgpHostFs {
  const programFile = (path: string) => programCode?.(canonicalPath(path));
  const isHidden = (path: string) =>
    programCode?.(`${canonicalPath(path)}.ts`) !== undefined;
  const encoder = new TextEncoder();

  return {
    read(path) {
      const hostPath = fromWasmPath(path);
      const code = programFile(hostPath);
      if (code !== undefined) return encoder.encode(code);
      if (isHidden(hostPath)) return null;
      const buffer = orNull(() => fs.readFileSync(hostPath));
      return buffer && new Uint8Array(buffer);
    },
    metadata(path) {
      const hostPath = fromWasmPath(path);
      if (programFile(hostPath) !== undefined) return FILE;
      if (isHidden(hostPath)) return null;
      const stats = orNull(() => fs.statSync(hostPath));
      return stats && toStat(stats);
    },
    symlinkMetadata(path) {
      const hostPath = fromWasmPath(path);
      if (programFile(hostPath) !== undefined) return FILE;
      if (isHidden(hostPath)) return null;
      const stats = orNull(() => fs.lstatSync(hostPath));
      return stats && toStat(stats);
    },
    readLink(path) {
      const target = orNull(() => fs.readlinkSync(fromWasmPath(path), 'utf-8'));
      return target !== null ? toWasmPath(target) : null;
    },
    canonicalize(path) {
      const hostPath = fromWasmPath(path);
      if (programFile(hostPath) !== undefined) {
        const dir = orNull(() => fs.realpathSync(dirname(hostPath)));
        return dir && toWasmPath(join(dir, basename(hostPath)));
      }
      if (isHidden(hostPath)) return null;
      const real = orNull(() => fs.realpathSync(hostPath));
      return real && toWasmPath(real);
    },
    readDir(path) {
      const hostPath = fromWasmPath(path);
      const entries = orNull(() =>
        fs.readdirSync(hostPath, { withFileTypes: true }),
      );
      return (
        entries &&
        entries.map((entry) =>
          isHidden(join(hostPath, entry.name))
            ? { ...FILE, name: `${entry.name}.ts` }
            : { ...toStat(entry), name: entry.name },
        )
      );
    },
  };
}
