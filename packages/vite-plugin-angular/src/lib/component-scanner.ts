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

/** Optional import site context for module-scoped selector lookup. */
export interface SelectorLookupContext {
  moduleSpecifier?: string;
  containingFile?: string;
}

interface ReExportTarget {
  file: string;
  importedName: string;
}

interface FileExportMap {
  /** `export { LocalName as ExportedName }` for declarations in this file. */
  localAliases: Map<string, string>;
  /** `export { ImportedName as ExportedName } from './target'`. */
  namedReExports: Map<string, ReExportTarget>;
  /** `export * from './target'` (excluding `export * as ns from`). */
  starReExports: string[];
}

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
  /** Entries declared in each scanned source file, keyed by normalized path. */
  private readonly entriesByFile: Map<string, RegistryEntry[]> = new Map();
  /** Direct resolved target file per importer and module specifier. */
  private readonly resolvedImports: Map<string, Map<string, string>> =
    new Map();
  /** Export aliases and re-export bindings per scanned file, keyed by normalized path. */
  private readonly reExportsByFile: Map<string, FileExportMap> = new Map();
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
    this.entriesByFile.clear();
    this.resolvedImports.clear();
    this.reExportsByFile.clear();
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
    const importerKey = normalizePath(id);
    await Promise.all(
      specs.map(async (spec) => {
        const file = await resolveImport(spec, id);
        if (!file) {
          this.resolvedImports.get(importerKey)?.delete(spec);
          return;
        }
        const normalizedFile = normalizePath(file);
        const scannedFiles = await this.scanOnDemand(
          normalizedFile,
          resolveImport,
        );
        let bySpec = this.resolvedImports.get(importerKey);
        if (!bySpec) {
          bySpec = new Map();
          this.resolvedImports.set(importerKey, bySpec);
        }
        bySpec.set(spec, normalizedFile);
        for (const scanned of scannedFiles) {
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
   * Resolves the registry entry for an imported or global Angular declaration.
   * When `context` gives the importing file and module specifier, exported
   * bindings on the resolved module (including barrel re-exports) are followed
   * before falling back to the global registry.
   */
  lookupEntry(
    className: string,
    external: readonly ComponentRegistryEntries[] = [],
    context?: SelectorLookupContext,
  ): RegistryEntry | undefined {
    if (context?.moduleSpecifier && context.containingFile) {
      const targetFile = this.resolvedImports
        .get(normalizePath(context.containingFile))
        ?.get(context.moduleSpecifier);
      if (targetFile) {
        const match = this.resolveExportedEntry(
          targetFile,
          className,
          new Set(),
        );
        if (match) {
          return match;
        }
      }
    }

    return (
      this.registry.get(className) ??
      external.map((r) => r.get(className)).find((e) => e !== undefined)
    );
  }

  /**
   * The element selector of a component or directive class. `external` are
   * registries contributed through `analog.setup()`. When `context` gives the
   * importing file and module specifier, declarations scanned from that module
   * (and its re-exports) are checked before falling back to the global registry.
   */
  lookupSelector(
    className: string,
    external: readonly ComponentRegistryEntries[] = [],
    context?: SelectorLookupContext,
  ): string | null {
    const entry = this.lookupEntry(className, external, context);
    if (!entry || !isSelectableEntry(entry)) {
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
    return this.entriesByFile.get(normalizePath(file)) ?? [];
  }

  /**
   * Records the entries scanned from a source file in both per-file storage
   * and the global registry.
   */
  recordFileEntries(
    file: string,
    entries: RegistryEntry[],
    overwrite = false,
  ): void {
    const key = normalizePath(file);
    const previous = this.entriesByFile.get(key);
    if (entries.length > 0) {
      this.entriesByFile.set(key, entries);
    } else {
      this.entriesByFile.delete(key);
    }
    if (previous) {
      const nextNames = new Set(entries.map((e) => e.className));
      for (const old of previous) {
        if (!nextNames.has(old.className)) {
          this.removeFromRegistryIfOwned(old.className, key);
        }
      }
    }
    for (const entry of entries) {
      const current = this.registry.get(entry.className);
      if (overwrite || !current || normalizePath(current.fileName) === key) {
        this.registry.set(entry.className, entry);
      }
    }
  }

  /** Drops what was scanned from `file`, so the next scan reads it again. */
  invalidate(file: string): void {
    const key = normalizePath(file);
    const oldEntries = this.entriesByFile.get(key) ?? [];
    this.entriesByFile.delete(key);
    for (const entry of oldEntries) {
      this.removeFromRegistryIfOwned(entry.className, key);
    }
    this.resolvedImports.delete(key);
    this.reExportsByFile.delete(key);
    this.lazyScans.clear();
  }

  private addEntry(entry: RegistryEntry): void {
    if (!this.registry.has(entry.className)) {
      this.registry.set(entry.className, entry);
    }
  }

  private resolveExportedEntry(
    file: string,
    exportName: string,
    visited: Set<string>,
  ): RegistryEntry | undefined {
    const visitKey = `${file}\0${exportName}`;
    if (visited.has(visitKey)) {
      return undefined;
    }
    visited.add(visitKey);

    const exportMap = this.reExportsByFile.get(file);
    const namedReExport = exportMap?.namedReExports.get(exportName);
    if (namedReExport) {
      return this.resolveExportedEntry(
        namedReExport.file,
        namedReExport.importedName,
        visited,
      );
    }

    const entries = this.entriesByFile.get(file);
    if (entries) {
      if (exportName === 'default') {
        const localDefault = exportMap?.localAliases.get('default');
        const match = entries.find(
          (entry) =>
            entry.isDefaultExport === true ||
            (localDefault !== undefined && entry.className === localDefault),
        );
        if (match) {
          return match;
        }
      } else {
        const localName = exportMap?.localAliases.get(exportName) ?? exportName;
        const match = entries.find((entry) => entry.className === localName);
        if (match) {
          return match;
        }
      }
    }

    if (exportName !== 'default' && exportMap) {
      for (const starFile of exportMap.starReExports) {
        const match = this.resolveExportedEntry(starFile, exportName, visited);
        if (match) {
          return match;
        }
      }
    }

    return undefined;
  }

  private removeFromRegistryIfOwned(className: string, ownerKey: string): void {
    const current = this.registry.get(className);
    if (!current || normalizePath(current.fileName) !== ownerKey) {
      return;
    }
    this.registry.delete(className);
    for (const entries of this.entriesByFile.values()) {
      const replacement = entries.find((e) => e.className === className);
      if (replacement) {
        this.registry.set(className, replacement);
        break;
      }
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
      const currentKey = normalizePath(current);
      if (visited.has(currentKey)) return;
      visited.add(currentKey);
      let code: string;
      let program: OxcProgram;
      try {
        code = await this.readScanSource(currentKey);
        program = parseOxc(currentKey, code).program;
      } catch {
        return;
      }
      const entries = scanFile(code, currentKey, program);
      this.recordFileEntries(currentKey, entries);
      this.ensureDtsRegistryForSource(code, currentKey, program);
      const followsImports = entries.some(
        (e) => e.kind === 'tuple' || e.kind === 'ngmodule',
      );
      const specifiers = followsImports
        ? collectAllImports(code, currentKey, program)
        : collectReExports(code, currentKey, program);

      const resolvedBySpec = new Map<string, string>();
      for (const spec of specifiers) {
        if (resolvedBySpec.has(spec)) continue;
        const dep = await resolveImport(spec, currentKey);
        if (dep) resolvedBySpec.set(spec, normalizePath(dep));
      }

      const exportMap = collectFileExportMap(program, resolvedBySpec);
      if (exportMap) {
        this.reExportsByFile.set(currentKey, exportMap);
      } else {
        this.reExportsByFile.delete(currentKey);
      }

      for (const dep of resolvedBySpec.values()) {
        await visit(dep);
      }
    };
    await visit(file);
    return visited;
  }
}

function isSelectableEntry(entry: RegistryEntry): boolean {
  return entry.kind === 'component' || entry.kind === 'directive';
}

function moduleExportName(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function collectFileExportMap(
  program: OxcProgram,
  resolvedBySpec: Map<string, string>,
): FileExportMap | null {
  const localAliases = new Map<string, string>();
  const namedReExports = new Map<string, ReExportTarget>();
  const starReExports: string[] = [];

  for (const stmt of program.body || []) {
    if ((stmt as any).exportKind === 'type') continue;
    if (stmt.type === 'ExportNamedDeclaration') {
      const source: string | undefined = stmt.source?.value;
      if (!source) {
        for (const spec of (stmt as any).specifiers || []) {
          if (spec.exportKind === 'type') continue;
          const localName = moduleExportName(spec.local);
          const exportedName = moduleExportName(spec.exported);
          if (localName && exportedName && localName !== exportedName) {
            localAliases.set(exportedName, localName);
          }
        }
      } else {
        const targetFile = resolvedBySpec.get(source);
        if (!targetFile) continue;
        for (const spec of (stmt as any).specifiers || []) {
          if (spec.exportKind === 'type') continue;
          const importedName = moduleExportName(spec.local);
          const exportedName = moduleExportName(spec.exported);
          if (importedName && exportedName) {
            namedReExports.set(exportedName, {
              file: targetFile,
              importedName,
            });
          }
        }
      }
    } else if (stmt.type === 'ExportAllDeclaration') {
      if ((stmt as any).exported) continue;
      const source: string | undefined = stmt.source?.value;
      const targetFile = source ? resolvedBySpec.get(source) : undefined;
      if (targetFile && !starReExports.includes(targetFile)) {
        starReExports.push(targetFile);
      }
    }
  }

  if (
    localAliases.size === 0 &&
    namedReExports.size === 0 &&
    starReExports.length === 0
  ) {
    return null;
  }
  return { localAliases, namedReExports, starReExports };
}
