import { parseSync } from 'oxc-parser';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RegistryEntry, RegistryInput } from './registry.js';

/**
 * Scan a single .d.ts file and extract Angular directive/component/pipe
 * metadata from the static ɵdir / ɵcmp / ɵpipe type declarations.
 *
 * This mirrors what ngtsc's DtsMetadataReader does: it reads the type
 * parameters of ɵɵDirectiveDeclaration / ɵɵComponentDeclaration /
 * ɵɵPipeDeclaration to discover selectors, inputs, and outputs for
 * pre-compiled Angular packages.
 */
export function scanDtsFile(code: string, fileName: string): RegistryEntry[] {
  // Fast pre-filter — skip files that can't contain Angular declarations
  if (
    !code.includes('DirectiveDeclaration') &&
    !code.includes('ComponentDeclaration') &&
    !code.includes('PipeDeclaration') &&
    !code.includes('NgModuleDeclaration')
  )
    return [];

  const { program } = parseSync(fileName, code);
  const entries: RegistryEntry[] = [];

  visitStatements(program.body, fileName, entries);
  return entries;
}

/**
 * Resolve a package's directory in node_modules, scan all its .d.ts files,
 * and return RegistryEntry[] for every Angular declaration found.
 *
 * @param packageName  e.g. "@angular/router"
 * @param basePath     project root (where node_modules lives)
 */
export function scanPackageDts(
  packageName: string,
  basePath: string,
): RegistryEntry[] {
  // Walk up from basePath to find the nearest node_modules containing the package.
  // This handles monorepos where node_modules is at the workspace root,
  // not in the project subdirectory.
  let pkgDir = '';
  let searchBase = basePath;
  while (searchBase !== path.dirname(searchBase)) {
    const candidate = path.join(searchBase, 'node_modules', packageName);
    if (fs.existsSync(candidate)) {
      pkgDir = candidate;
      break;
    }
    searchBase = path.dirname(searchBase);
  }
  if (!pkgDir) return [];

  // Build a map from className → correct import path using package.json exports.
  // This handles packages with sub-entry points (e.g. @angular/material/tabs)
  // where re-exported classes must be imported from their origin entry point.
  const classToImportPath = buildClassToImportMap(packageName, pkgDir);

  // Check for a "types" directory first (Angular packages use this),
  // then fall back to the package root.
  const typesDir = path.join(pkgDir, 'types');
  const searchDir = fs.existsSync(typesDir) ? typesDir : pkgDir;

  const dtsFiles = collectDtsFiles(searchDir);
  const entries: RegistryEntry[] = [];

  for (const file of dtsFiles) {
    try {
      const code = fs.readFileSync(file, 'utf-8');
      const fileEntries = scanDtsFile(code, file);
      for (const entry of fileEntries) {
        entry.sourcePackage =
          classToImportPath.get(entry.className) ||
          subEntryFromFilePath(packageName, pkgDir, file) ||
          packageName;
      }
      entries.push(...fileEntries);
    } catch {
      // Skip unreadable files
    }
  }

  return entries;
}

/**
 * Read package.json exports to build a map from class name to the correct
 * sub-entry import path (e.g. "MatTabNav" → "@angular/material/tabs").
 *
 * For each sub-entry that has a "types" field, the corresponding .d.ts file
 * is read to collect declared class names and re-exported names.
 */
function buildClassToImportMap(
  packageName: string,
  pkgDir: string,
): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'),
    );
    if (!pkgJson.exports) return map;

    for (const [key, value] of Object.entries(pkgJson.exports) as [
      string,
      any,
    ][]) {
      if (key !== '.' && !key.startsWith('./')) continue;
      // Resolve types from the export entry. Some packages declare
      // `types` only at the package root (top-level package.json `types`
      // field) rather than per-export, so fall back to that for `.`.
      let typesFile: string | undefined =
        typeof value === 'object' && value !== null && value.types;
      if (!typesFile && key === '.' && typeof pkgJson.types === 'string') {
        typesFile = pkgJson.types;
      }
      if (!typesFile) continue;

      // Root entry (`.`) maps classes to the bare package name; sub-entries
      // (`./tabs`) map to `${packageName}/tabs`. Mapping root-exported
      // classes prevents `subEntryFromFilePath` from deriving an invalid
      // subpath like `ngx-scrollbar/lib` for files that physically live in
      // a `lib/` subdirectory but are only re-exported from the root entry.
      const importPath =
        key === '.' ? packageName : packageName + '/' + key.slice(2);
      const fullTypesPath = path.resolve(pkgDir, typesFile);
      if (!fs.existsSync(fullTypesPath)) continue;

      collectExportedClassesFromDts(fullTypesPath, importPath, map);
    }
  } catch {
    // No package.json or no exports — fall back to packageName
  }
  return map;
}

/**
 * Read a `.d.ts` entry file and add every class it exports to `map`,
 * following `export * from './rel'` chains so re-exported classes from
 * physically nested files (e.g. `lib/foo.d.ts`) are still mapped to the
 * exporting entry's import path.
 *
 * Without this, packages whose root `index.d.ts` is just a barrel of
 * `export * from './lib/...'` would never get their classes mapped, and the
 * `subEntryFromFilePath` fallback would derive an invalid `${pkg}/lib`
 * import for files living under `lib/`.
 */
function collectExportedClassesFromDts(
  filePath: string,
  importPath: string,
  map: Map<string, string>,
  visited: Set<string> = new Set(),
): void {
  if (visited.has(filePath)) return;
  visited.add(filePath);
  let code: string;
  try {
    code = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  let program: any;
  try {
    program = parseSync(filePath, code).program;
  } catch {
    return;
  }

  const dir = path.dirname(filePath);
  for (const stmt of program.body || []) {
    // `declare class Foo` (top-level)
    if (stmt.type === 'ClassDeclaration' && stmt.id?.name) {
      map.set(stmt.id.name, importPath);
      continue;
    }

    // `export declare class Foo` / `export class Foo` /
    // `export { A, B as C } from '...'` / `export { A, B }`
    if (stmt.type === 'ExportNamedDeclaration') {
      if (
        stmt.declaration?.type === 'ClassDeclaration' &&
        stmt.declaration.id?.name
      ) {
        map.set(stmt.declaration.id.name, importPath);
      }
      for (const spec of stmt.specifiers || []) {
        // ExportSpecifier: { local, exported }
        const exportedNode = spec.exported;
        const exportedName =
          exportedNode?.type === 'Identifier'
            ? exportedNode.name
            : exportedNode?.type === 'Literal'
              ? exportedNode.value
              : undefined;
        if (typeof exportedName === 'string') {
          map.set(exportedName, importPath);
        }
      }
      continue;
    }

    // `export * from './rel'` and `export * as Ns from './rel'`
    if (stmt.type === 'ExportAllDeclaration') {
      const rel: string | undefined = stmt.source?.value;
      if (!rel || !rel.startsWith('.')) continue;
      // TypeScript preserves the original specifier text in emitted
      // `.d.ts` files, so NodeNext-style packages keep their `.js`
      // (or `.mjs`) extensions in re-exports — but the actual
      // declaration is at `foo.d.ts` / `foo/index.d.ts`. Strip the
      // ESM extension before probing.
      const normalizedRel = rel.replace(/\.(?:js|mjs)$/u, '');
      const candidates = [
        path.resolve(dir, normalizedRel + '.d.ts'),
        path.resolve(dir, normalizedRel, 'index.d.ts'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          collectExportedClassesFromDts(candidate, importPath, map, visited);
          break;
        }
      }
      continue;
    }
  }
}

/**
 * Derive a sub-entry import path from a .d.ts file's location relative to the
 * package root. This handles older Angular packages that keep .d.ts files in
 * subdirectories (e.g. `@angular/material/tabs/index.d.ts`) instead of a
 * top-level `types/` folder.
 *
 * Returns `undefined` when no sub-entry can be determined (e.g. file is at the
 * package root, inside `types/`, or in a non-entry directory).
 */
function subEntryFromFilePath(
  packageName: string,
  pkgDir: string,
  filePath: string,
): string | undefined {
  const NON_ENTRY_DIRS = new Set([
    'types',
    'fesm2022',
    'fesm2020',
    'fesm2015',
    'esm2022',
    'esm2020',
    'esm2015',
    'bundles',
    'schematics',
    'node_modules',
  ]);
  const rel = path.relative(pkgDir, filePath);
  const segments = rel.split(path.sep);
  // File directly in pkgDir (no subdirectory) → no sub-entry
  if (segments.length < 2) return undefined;
  const firstDir = segments[0];
  // Skip internal/build directories and chunk files
  if (NON_ENTRY_DIRS.has(firstDir) || firstDir.startsWith('_'))
    return undefined;
  return packageName + '/' + firstDir;
}

/**
 * Parse a source file with OXC and return the set of bare-specifier package
 * names it imports (e.g. "@angular/router", "rxjs"). Relative imports are
 * skipped.
 */
export function collectImportedPackages(
  code: string,
  fileName: string,
): Set<string> {
  const packages = new Set<string>();
  const { program } = parseSync(fileName, code);

  for (const stmt of program.body) {
    if (stmt.type !== 'ImportDeclaration') continue;
    const specifier: string = stmt.source?.value;
    if (!specifier || specifier.startsWith('.')) continue;

    const parts = specifier.split('/');
    packages.add(
      specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0],
    );
  }

  return packages;
}

/**
 * Parse a source file with OXC and return the relative-path specifiers it
 * re-exports via `export * from './x'`, `export * as Ns from './x'`, or
 * `export { … } from './x'`. Bare-specifier re-exports are skipped.
 *
 * Used by the analog Vite plugin to walk library entry barrels at startup
 * (e.g. `helm/select/src/index.ts` → `./lib/hlm-select`) so the underlying
 * directive classes land in the registry before any consumer is compiled.
 */
export function collectRelativeReExports(
  code: string,
  fileName: string,
): string[] {
  let program: any;
  try {
    program = parseSync(fileName, code).program;
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const stmt of program.body || []) {
    if (
      stmt.type !== 'ExportAllDeclaration' &&
      stmt.type !== 'ExportNamedDeclaration'
    ) {
      continue;
    }
    // ExportNamedDeclaration without `source` is `export { x }` (no
    // re-export), which we don't care about here.
    const specifier: string | undefined = stmt.source?.value;
    if (!specifier || !specifier.startsWith('.')) continue;
    result.push(specifier);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function visitStatements(
  stmts: any[],
  fileName: string,
  entries: RegistryEntry[],
) {
  for (const stmt of stmts) {
    // Unwrap exports: `export declare class ...` / `export default class ...`
    const decl =
      stmt.type === 'ExportNamedDeclaration' ||
      stmt.type === 'ExportDefaultDeclaration'
        ? stmt.declaration
        : stmt;

    if (!decl) continue;

    // Recurse into `declare module "..." { ... }` blocks
    if (decl.type === 'TSModuleDeclaration' && decl.body?.body) {
      visitStatements(decl.body.body, fileName, entries);
      continue;
    }

    if (decl.type !== 'ClassDeclaration' || !decl.id?.name) continue;
    const className: string = decl.id.name;
    const members: any[] = decl.body?.body || [];

    for (const member of members) {
      if (member.type !== 'PropertyDefinition' || !member.static) continue;
      const propName: string | undefined = member.key?.name;

      // Read the type annotation: e.g. `i0.ɵɵDirectiveDeclaration<...>`
      const typeRef = member.typeAnnotation?.typeAnnotation;
      if (!typeRef || typeRef.type !== 'TSTypeReference') continue;

      const typeName = qualifiedName(typeRef.typeName);
      const typeParams: any[] | undefined = typeRef.typeArguments?.params;

      if (
        (propName === 'ɵdir' || propName === 'ɵcmp') &&
        (typeName.includes('DirectiveDeclaration') ||
          typeName.includes('ComponentDeclaration')) &&
        typeParams &&
        typeParams.length >= 5
      ) {
        const selector = literalString(typeParams[1]);
        if (!selector) continue;

        const inputs = extractInputs(typeParams[3]);
        const outputs = extractOutputs(typeParams[4]);

        entries.push({
          selector: selector.split(',')[0].trim(),
          kind: propName === 'ɵcmp' ? 'component' : 'directive',
          fileName,
          className,
          ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
          ...(Object.keys(outputs).length > 0 ? { outputs } : {}),
        });
      } else if (
        propName === 'ɵpipe' &&
        typeName.includes('PipeDeclaration') &&
        typeParams &&
        typeParams.length >= 2
      ) {
        const pipeName = literalString(typeParams[1]);
        if (!pipeName) continue;

        entries.push({
          selector: pipeName,
          kind: 'pipe',
          pipeName,
          fileName,
          className,
        });
      } else if (
        propName === 'ɵmod' &&
        typeName.includes('NgModuleDeclaration') &&
        typeParams &&
        typeParams.length >= 4
      ) {
        // ɵɵNgModuleDeclaration<Module, Declarations, Imports, Exports>
        // Extract exported class names from the 4th type param (index 3).
        const exportsParam = typeParams[3];
        const exportedNames: string[] = [];
        if (exportsParam?.type === 'TSTupleType' && exportsParam.elementTypes) {
          for (const el of exportsParam.elementTypes) {
            if (
              el.type === 'TSTypeQuery' &&
              el.exprName?.type === 'Identifier'
            ) {
              exportedNames.push(el.exprName.name);
            } else if (
              el.type === 'TSTypeQuery' &&
              el.exprName?.type === 'TSQualifiedName'
            ) {
              // e.g. typeof i2.BidiModule → extract "BidiModule"
              const right = el.exprName.right;
              if (right?.type === 'Identifier') {
                exportedNames.push(right.name);
              }
            }
          }
        }
        entries.push({
          selector: className,
          kind: 'ngmodule',
          exports: exportedNames,
          fileName,
          className,
        });
      }
    }
  }
}

/**
 * Extract inputs from the type-argument at position [3].
 *
 * Handles two formats:
 *   v16+:    { "prop": { "alias": "binding"; "required": false; "isSignal"?: true } }
 *   pre-v16: { "prop": "binding" }
 */
function extractInputs(node: any): Record<string, RegistryInput> {
  const inputs: Record<string, RegistryInput> = {};
  if (node?.type !== 'TSTypeLiteral') return inputs;

  for (const member of node.members) {
    if (member.type !== 'TSPropertySignature') continue;
    const propName = keyName(member.key);
    const innerType = member.typeAnnotation?.typeAnnotation;
    if (!propName || !innerType) continue;

    if (innerType.type === 'TSTypeLiteral') {
      // v16+ object format
      let alias = propName;
      let required = false;
      let isSignal = false;

      for (const inner of innerType.members) {
        if (inner.type !== 'TSPropertySignature') continue;
        const key = keyName(inner.key);
        const val = inner.typeAnnotation?.typeAnnotation;
        if (!key || !val) continue;

        if (key === 'alias') {
          alias = literalString(val) ?? propName;
        } else if (key === 'required') {
          required = literalBoolean(val) === true;
        } else if (key === 'isSignal') {
          isSignal = literalBoolean(val) === true;
        }
      }

      inputs[propName] = {
        classPropertyName: propName,
        bindingPropertyName: alias,
        isSignal,
        required,
      };
    } else {
      // pre-v16 string format
      const alias = literalString(innerType);
      if (alias) {
        inputs[propName] = {
          classPropertyName: propName,
          bindingPropertyName: alias,
          isSignal: false,
          required: false,
        };
      }
    }
  }

  return inputs;
}

/**
 * Extract outputs from the type-argument at position [4].
 * Format: { "propName": "eventName" }
 */
function extractOutputs(node: any): Record<string, string> {
  const outputs: Record<string, string> = {};
  if (node?.type !== 'TSTypeLiteral') return outputs;

  for (const member of node.members) {
    if (member.type !== 'TSPropertySignature') continue;
    const propName = keyName(member.key);
    const val = member.typeAnnotation?.typeAnnotation;
    if (!propName || !val) continue;

    const value = literalString(val);
    if (value) outputs[propName] = value;
  }

  return outputs;
}

/** Get the string name from a property key (Identifier or Literal). */
function keyName(key: any): string | undefined {
  if (!key) return undefined;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return undefined;
}

/** Build a dotted name from an Identifier or TSQualifiedName. */
function qualifiedName(node: any): string {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'TSQualifiedName')
    return qualifiedName(node.left) + '.' + qualifiedName(node.right);
  return '';
}

/** Extract a string value from a TSLiteralType node. */
function literalString(node: any): string | undefined {
  if (
    node?.type === 'TSLiteralType' &&
    node.literal?.type === 'Literal' &&
    typeof node.literal.value === 'string'
  ) {
    return node.literal.value;
  }
  return undefined;
}

/** Extract a boolean value from a TSLiteralType node. */
function literalBoolean(node: any): boolean | undefined {
  if (
    node?.type === 'TSLiteralType' &&
    node.literal?.type === 'Literal' &&
    typeof node.literal.value === 'boolean'
  ) {
    return node.literal.value;
  }
  return undefined;
}

/** Recursively collect all .d.ts files under a directory. */
function collectDtsFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...collectDtsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }

  return results;
}
