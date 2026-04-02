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
    !code.includes('PipeDeclaration')
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
  const pkgDir = path.join(basePath, 'node_modules', packageName);

  // Check for a "types" directory first (Angular packages use this),
  // then fall back to the package root.
  const typesDir = path.join(pkgDir, 'types');
  const searchDir = fs.existsSync(typesDir) ? typesDir : pkgDir;

  const dtsFiles = collectDtsFiles(searchDir);
  const entries: RegistryEntry[] = [];

  for (const file of dtsFiles) {
    try {
      const code = fs.readFileSync(file, 'utf-8');
      entries.push(...scanDtsFile(code, file));
    } catch {
      // Skip unreadable files
    }
  }

  return entries;
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
