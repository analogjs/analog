import { parseSync } from 'oxc-parser';

// ── Type-only import elision via OXC AST ────────────────────────────────

/**
 * AST property keys that represent type-only positions in TypeScript.
 * Identifiers found only under these keys are never emitted as runtime values.
 */
const TYPE_POSITION_KEYS = new Set([
  'typeAnnotation',
  'typeParameters',
  'superTypeParameters',
  'implements',
  'returnType',
  'typeArguments',
]);

/**
 * AST node types that represent type-level constructs.
 * Any identifier nested inside one of these nodes is in a type position.
 */
const TYPE_NODE_TYPES = new Set([
  'TSTypeAnnotation',
  'TSTypeReference',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSUnionType',
  'TSIntersectionType',
  'TSArrayType',
  'TSTupleType',
  'TSFunctionType',
  'TSConstructorType',
  'TSMappedType',
  'TSConditionalType',
  'TSIndexedAccessType',
  'TSTypeQuery',
  'TSTypeLiteral',
  'TSQualifiedName',
  'TSInterfaceBody',
]);

/**
 * Analyse compiled TypeScript source and return the set of imported names
 * that are only referenced in type positions (type annotations, implements
 * clauses, generics, etc.) and can safely be elided.
 *
 * Uses oxc-parser for fast, Rust-based AST analysis — no type-checker needed.
 */
export function detectTypeOnlyImportNames(code: string): Set<string> {
  const ast = parseSync('file.ts', code).program;

  // Step 1 – collect all value-imported names (skip `import type` / `{ type X }`)
  const importedNames = new Set<string>();
  for (const node of (ast as any).body) {
    if (node.type !== 'ImportDeclaration') continue;
    if (node.importKind === 'type') continue; // already type-only
    for (const spec of node.specifiers ?? []) {
      if (spec.importKind === 'type') continue; // already type-only
      importedNames.add(spec.local.name);
    }
  }
  if (importedNames.size === 0) return new Set();

  // Step 2 – walk AST and collect names referenced in value positions
  const valueReferenced = new Set<string>();

  function walk(node: any, inTypePosition: boolean): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, inTypePosition);
      return;
    }

    // Short-circuit: if we found every imported name in a value position, stop
    if (valueReferenced.size === importedNames.size) return;

    // If this node's type itself marks a type construct, everything below is type-only
    if (!inTypePosition && TYPE_NODE_TYPES.has(node.type)) {
      inTypePosition = true;
    }

    if (
      !inTypePosition &&
      node.type === 'Identifier' &&
      importedNames.has(node.name)
    ) {
      valueReferenced.add(node.name);
      return;
    }

    for (const key of Object.keys(node)) {
      if (
        key === 'type' ||
        key === 'start' ||
        key === 'end' ||
        key === 'range' ||
        key === 'loc'
      )
        continue;
      const isTypePos = inTypePosition || TYPE_POSITION_KEYS.has(key);
      walk(node[key], isTypePos);
    }
  }

  for (const node of (ast as any).body) {
    // Skip import declarations themselves – we already processed them
    if (node.type !== 'ImportDeclaration') {
      walk(node, false);
    }
  }

  // Step 3 – names that were imported but never value-referenced are type-only
  const typeOnly = new Set<string>();
  for (const name of importedNames) {
    if (!valueReferenced.has(name)) typeOnly.add(name);
  }
  return typeOnly;
}

/**
 * Elide import specifiers (or entire import declarations) for names that are
 * only used in type positions. Operates on the compiler's TypeScript output
 * (before OXC strips remaining TS syntax).
 *
 * Returns the modified source code, or the original if nothing was elided.
 */
export function elideTypeOnlyImports(code: string): string {
  const typeOnlyNames = detectTypeOnlyImportNames(code);
  if (typeOnlyNames.size === 0) return code;

  const ast = parseSync('file.ts', code).program;

  // Collect replacements: each entry is a [start, end, replacement] tuple.
  // For whole-declaration removal the replacement is empty; for partial
  // removal the replacement is a rebuilt import statement.
  const replacements: Array<[number, number, string]> = [];

  for (const node of (ast as any).body) {
    if (node.type !== 'ImportDeclaration') continue;
    if (node.importKind === 'type') continue;

    const allSpecs = node.specifiers ?? [];

    // Separate default and named specifiers
    const defaultSpec = allSpecs.find(
      (s: any) => s.type === 'ImportDefaultSpecifier',
    );
    const namedSpecs = allSpecs.filter(
      (s: any) => s.type === 'ImportSpecifier' && s.importKind !== 'type',
    );

    const elideDefault =
      defaultSpec && typeOnlyNames.has(defaultSpec.local.name);
    const keptNamed = namedSpecs.filter(
      (s: any) => !typeOnlyNames.has(s.local.name),
    );
    const removingNamed = namedSpecs.length - keptNamed.length;

    // Nothing to elide from this declaration
    if (!elideDefault && removingNamed === 0) continue;

    // Find the end of the declaration including trailing newline
    let declEnd = node.end;
    while (declEnd < code.length && code[declEnd] === '\n') declEnd++;

    const keepDefault = defaultSpec && !elideDefault;
    const hasKeptNamed = keptNamed.length > 0;

    if (!keepDefault && !hasKeptNamed) {
      // Remove entire import declaration
      replacements.push([node.start, declEnd, '']);
    } else {
      // Rebuild with only the kept specifiers
      const parts: string[] = [];
      if (keepDefault) parts.push(defaultSpec.local.name);
      if (hasKeptNamed) {
        const namedList = keptNamed.map((s: any) => {
          const imported = s.imported?.name ?? s.local.name;
          return imported === s.local.name
            ? s.local.name
            : `${imported} as ${s.local.name}`;
        });
        parts.push(`{ ${namedList.join(', ')} }`);
      }
      const source = node.source.value;
      const quote = code[node.source.start]; // preserve original quote style
      replacements.push([
        node.start,
        node.end,
        `import ${parts.join(', ')} from ${quote}${source}${quote};`,
      ]);
    }
  }

  if (replacements.length === 0) return code;

  // Apply in reverse order to preserve offsets
  replacements.sort((a, b) => b[0] - a[0]);
  let result = code;
  for (const [start, end, replacement] of replacements) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}
