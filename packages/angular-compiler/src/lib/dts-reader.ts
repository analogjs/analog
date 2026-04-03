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
      if (!key.startsWith('./') || key === '.') continue;
      const typesFile =
        typeof value === 'object' && value !== null && value.types;
      if (!typesFile) continue;

      const subEntry = key.slice(2); // './tabs' → 'tabs'
      const importPath = packageName + '/' + subEntry;
      const fullTypesPath = path.resolve(pkgDir, typesFile);
      if (!fs.existsSync(fullTypesPath)) continue;

      try {
        const code = fs.readFileSync(fullTypesPath, 'utf-8');
        // Collect declared class names (e.g. "declare class MatTabNav")
        for (const match of code.matchAll(/declare\s+class\s+(\w+)/g)) {
          map.set(match[1], importPath);
        }
        // Collect re-exported names (e.g. "export { Dir, BidiModule } from '...'")
        for (const match of code.matchAll(/export\s*\{([^}]+)\}/g)) {
          for (const name of match[1].split(',')) {
            const parts = name.trim().split(/\s+as\s+/);
            const exported = parts[parts.length - 1].trim();
            if (exported && /^\w+$/.test(exported)) {
              map.set(exported, importPath);
            }
          }
        }
      } catch {
        // Skip unreadable entry files
      }
    }
  } catch {
    // No package.json or no exports — fall back to packageName
  }
  return map;
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
