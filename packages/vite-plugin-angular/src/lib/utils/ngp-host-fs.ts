import * as fs from 'node:fs';
import { basename, dirname, join } from 'node:path';
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

function orNull<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
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
  const programFile = (path: string) => programCode(normalizePath(path));
  const isHidden = (path: string) =>
    programCode(`${normalizePath(path)}.ts`) !== undefined;
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
        entries.map((entry) => ({
          ...toStat(entry),
          name: isHidden(join(path, entry.name))
            ? `${entry.name}.ts`
            : entry.name,
        }))
      );
    },
  };
}
