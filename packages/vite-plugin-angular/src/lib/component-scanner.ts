import { promises as fsPromises } from 'node:fs';
import type { parseSync } from 'oxc-parser';
import { normalizePath } from 'vite';

import type { ComponentRegistryEntries } from './analog-plugin-interop.js';
import {
  collectAllImports,
  collectImportedPackages,
  collectReExports,
  scanFile,
  scanPackageDts,
  type ComponentRegistry,
  type RegistryEntry,
} from './compiler/index.js';
import { parseOxc } from './compiler/utils.js';
import type {
  FastCompileResolve,
  FastCompileSourceFormat,
} from './fast-compile-api.js';
import { EXCLUDED_TS_EXT_REGEX, TS_EXT_REGEX } from './utils/plugin-config.js';

type OxcProgram = ReturnType<typeof parseSync>['program'];

/** Resolves an import to a source file to scan, or `null` to skip it. */
export type ResolveImport = (
  spec: string,
  importer: string,
) => Promise<string | null>;

/**
 * Angular classes scanned from source files and package `.d.ts` declarations,
 * so source formats can look up the selectors of the components they import
 * before any compiler sees their modules. Shared by the fast compile and NGP
 * plugins.
 */
export class ComponentScanner {
  readonly registry: ComponentRegistry = new Map();
  readonly scannedDtsPackages: Set<string> = new Set();
  /** Files scanned on demand, mapped to the barrel chain each pulled in. */
  readonly lazyScans: Map<string, Promise<Set<string>>> = new Map();
  /** Modules compiled against each scanned file. */
  readonly importersByFile: Map<string, Set<string>> = new Map();
  private readonly sourceFormats: FastCompileSourceFormat[] = [];
  private root = '';

  /** Where package declarations are looked up from. */
  get projectRoot(): string {
    return this.root;
  }

  reset(projectRoot: string): void {
    this.root = projectRoot;
    this.registry.clear();
    this.scannedDtsPackages.clear();
    this.lazyScans.clear();
    this.importersByFile.clear();
  }

  registerSourceFormat(format: FastCompileSourceFormat): void {
    if (!this.sourceFormats.includes(format)) {
      this.sourceFormats.push(format);
    }
  }

  sourceFormatOf(file: string): FastCompileSourceFormat | undefined {
    const path = file.split('?')[0];
    return this.sourceFormats.find((format) => format.test(path));
  }

  /** Whether `file` is TypeScript or a module of a registered source format. */
  isCompiledSource(file: string): boolean {
    return TS_EXT_REGEX.test(file) || this.sourceFormatOf(file) !== undefined;
  }

  /**
   * Reads a source file for scanning. Modules of a registered source format
   * are converted to TypeScript first so the scanner sees their classes.
   */
  async readScanSource(file: string): Promise<string> {
    const code = await fsPromises.readFile(file, 'utf-8');
    const format = this.sourceFormatOf(file);
    return format ? format.toScanSource(code, file) : code;
  }

  /**
   * Adapts a Vite-style resolver to the scanner's: only source files this
   * scanner reads, outside `node_modules` (package declarations come from the
   * `.d.ts` scanner instead).
   */
  toResolveImport(resolve: FastCompileResolve): ResolveImport {
    return async (spec, importer) => {
      const resolved = await resolve(spec, importer);
      if (!resolved || resolved.external) return null;
      const file = normalizePath(resolved.id.split('?')[0]);
      return this.isCompiledSource(file) &&
        !EXCLUDED_TS_EXT_REGEX.test(file) &&
        !file.includes('/node_modules/')
        ? file
        : null;
    };
  }

  /** Scans the `.d.ts` declarations of `packages` into the registry, once each. */
  ensureDtsRegistryForPackages(packages: Iterable<string>): void {
    for (const pkg of packages) {
      if (this.scannedDtsPackages.has(pkg)) continue;
      this.scannedDtsPackages.add(pkg);
      try {
        const dtsEntries = scanPackageDts(
          pkg,
          // Before a tsconfig resolves, look up packages from the working directory.
          this.root || process.cwd(),
          this.scannedDtsPackages,
        );
        for (const entry of dtsEntries) {
          this.addEntry(entry);
        }
      } catch {
        // Package may not have .d.ts files or may not be Angular
      }
    }
  }

  ensureDtsRegistryForSource(
    code: string,
    id: string,
    program?: OxcProgram,
  ): void {
    this.ensureDtsRegistryForPackages(
      collectImportedPackages(code, id, program),
    );
  }

  /**
   * Scans the modules behind `specifiers`, imported by `importer`: packages
   * from their `.d.ts` declarations, everything else from source.
   */
  scanImports(
    specifiers: string[],
    importer: string,
    resolve: FastCompileResolve,
  ): Promise<void> {
    this.ensureDtsRegistryForPackages(
      specifiers
        .filter((spec) => !spec.startsWith('.') && !spec.startsWith('/'))
        .map((spec) => {
          const parts = spec.split('/');
          return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
        }),
    );
    return this.resolveImportSpecifiers(
      specifiers,
      importer,
      this.toResolveImport(resolve),
    );
  }

  /**
   * Scans the files behind `specs`, imported by `id`, into the registry and
   * records `id` as their importer.
   */
  async resolveImportSpecifiers(
    specs: string[],
    id: string,
    resolveImport: ResolveImport,
  ): Promise<void> {
    await Promise.all(
      specs.map(async (spec) => {
        const file = await resolveImport(spec, id);
        if (!file) return;
        for (const scanned of await this.scanOnDemand(file, resolveImport)) {
          let importers = this.importersByFile.get(scanned);
          if (!importers) {
            importers = new Set();
            this.importersByFile.set(scanned, importers);
          }
          importers.add(id);
        }
      }),
    );
  }

  /**
   * The element selector of a component or directive class. `external` are
   * registries contributed through `analog.setup()`.
   */
  lookupSelector(
    className: string,
    external: readonly ComponentRegistryEntries[] = [],
  ): string | null {
    const entry =
      this.registry.get(className) ??
      external.map((r) => r.get(className)).find((e) => e !== undefined);
    if (!entry || (entry.kind !== 'component' && entry.kind !== 'directive')) {
      return null;
    }
    return entry.selector;
  }

  /** The files scanned for `importer`. */
  dependenciesOf(importer: string): string[] {
    return [...this.importersByFile]
      .filter(([, importers]) => importers.has(importer))
      .map(([file]) => file);
  }

  entriesOf(file: string): RegistryEntry[] {
    return [...this.registry.values()].filter((e) => e.fileName === file);
  }

  /** Drops what was scanned from `file`, so the next scan reads it again. */
  invalidate(file: string): void {
    for (const entry of this.entriesOf(file)) {
      this.registry.delete(entry.className);
    }
    this.lazyScans.clear();
  }

  private addEntry(entry: RegistryEntry): void {
    if (!this.registry.has(entry.className)) {
      this.registry.set(entry.className, entry);
    }
  }

  private scanOnDemand(
    file: string,
    resolveImport: ResolveImport,
  ): Promise<Set<string>> {
    let scan = this.lazyScans.get(file);
    if (!scan) {
      scan = this.scanWithReExports(file, resolveImport);
      this.lazyScans.set(file, scan);
    }
    return scan;
  }

  /**
   * Scan a file and everything it re-exports, resolving specifiers through
   * Vite so path aliases work. Tuple barrels and NgModules can list classes
   * their file imports without re-exporting, so their imports are followed
   * too. Returns every file scanned.
   */
  private async scanWithReExports(
    file: string,
    resolveImport: ResolveImport,
  ): Promise<Set<string>> {
    const visited = new Set<string>();
    const visit = async (current: string): Promise<void> => {
      if (visited.has(current)) return;
      visited.add(current);
      let code: string;
      let program: OxcProgram;
      try {
        code = await this.readScanSource(current);
        program = parseOxc(current, code).program;
      } catch {
        return;
      }
      const entries = scanFile(code, current, program);
      for (const entry of entries) {
        this.addEntry(entry);
      }
      this.ensureDtsRegistryForSource(code, current, program);
      const followsImports = entries.some(
        (e) => e.kind === 'tuple' || e.kind === 'ngmodule',
      );
      const specifiers = followsImports
        ? collectAllImports(code, current, program)
        : collectReExports(code, current, program);
      for (const spec of specifiers) {
        const dep = await resolveImport(spec, current);
        if (dep) await visit(dep);
      }
    };
    await visit(file);
    return visited;
  }
}
