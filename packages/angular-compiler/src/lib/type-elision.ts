import MagicString from 'magic-string';
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
 * Internal helper: parse code and return both the AST and the set of
 * type-only imported names. Avoids double-parsing when both are needed.
 */
function analyzeTypeOnlyImports(code: string): {
  ast: any;
  typeOnlyNames: Set<string>;
} {
  const ast = parseSync('file.ts', code).program;

  // Step 1 – collect all value-imported names (skip `import type` / `{ type X }`)
  // Namespace imports (`import * as ns`) are intentionally skipped — they are
  // always value imports in TypeScript and cannot be type-only at the
  // declaration level.
  const importedNames = new Set<string>();
  for (const node of (ast as any).body) {
    if (node.type !== 'ImportDeclaration') continue;
    if (node.importKind === 'type') continue; // already type-only
    for (const spec of node.specifiers ?? []) {
      if (spec.importKind === 'type') continue; // already type-only
      importedNames.add(spec.local.name);
    }
  }
  if (importedNames.size === 0) return { ast, typeOnlyNames: new Set() };

  // Step 2 – walk AST and collect names referenced in value positions
  const valueReferenced = new Set<string>();

  // Pre-pass: constructor parameter types of decorated classes are DI tokens
  // and must be preserved as runtime values, even though they appear in
  // type-annotation positions. Without this, `constructor(svc: MyService)`
  // would erase the `MyService` import and `extractConstructorDeps` would
  // emit `ɵɵinvalidFactory()`.
  collectConstructorDiTokens(ast, importedNames, valueReferenced);

  function walk(node: any, inTypePosition: boolean): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, inTypePosition);
      return;
    }

    // Short-circuit: if we found every imported name in a value position, stop
    if (valueReferenced.size === importedNames.size) return;

    // If this node's type itself marks a type construct, everything below is type-only
    // Exception: TSAsExpression/TSSatisfiesExpression have a value `expression`
    // child that is NOT in a type position — only the type annotation is.
    if (!inTypePosition && TYPE_NODE_TYPES.has(node.type)) {
      if (
        node.type === 'TSAsExpression' ||
        node.type === 'TSSatisfiesExpression'
      ) {
        // Walk the expression child in value context, type annotation in type context
        walk(node.expression, false);
        walk(node.typeAnnotation, true);
        return;
      }
      inTypePosition = true;
    }

    // Type-only exports: `export type { Foo }` or `export { type Foo }`
    // Identifiers inside type-only export specifiers are not value references.
    if (
      !inTypePosition &&
      node.type === 'ExportNamedDeclaration' &&
      !node.source
    ) {
      // Walk the declaration (if any) in value context
      if (node.declaration) walk(node.declaration, false);
      // Walk each specifier, skipping type-only ones
      for (const spec of node.specifiers ?? []) {
        if (node.exportKind === 'type' || spec.exportKind === 'type') continue;
        walk(spec, false);
      }
      return;
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
  return { ast, typeOnlyNames: typeOnly };
}

/**
 * Walk the program looking for decorated classes with constructors and add
 * the type names from constructor parameter annotations to `valueReferenced`.
 *
 * Constructor parameter types are TypeScript type positions, but for decorated
 * classes they double as runtime DI tokens — Angular's compiler reads them
 * via `compileFactoryFunction` to wire `ɵɵdirectiveInject(...)` calls. The
 * import of the type therefore must NOT be elided as type-only.
 */
function collectConstructorDiTokens(
  ast: any,
  importedNames: Set<string>,
  valueReferenced: Set<string>,
): void {
  for (const stmt of (ast as any).body || []) {
    const classNode =
      stmt.type === 'ExportNamedDeclaration' ||
      stmt.type === 'ExportDefaultDeclaration'
        ? (stmt as any).declaration
        : stmt;
    if (
      !classNode ||
      (classNode.type !== 'ClassDeclaration' &&
        classNode.type !== 'ClassExpression')
    ) {
      continue;
    }
    if (!classNode.decorators?.length) continue;

    const ctor = (classNode.body?.body || []).find(
      (m: any) => m.type === 'MethodDefinition' && m.kind === 'constructor',
    );
    if (!ctor) continue;

    const params: any[] = ctor.value?.params?.items || ctor.value?.params || [];
    for (const param of params) {
      const actualParam =
        param.type === 'TSParameterProperty' ? param.parameter : param;
      const typeAnn =
        actualParam?.typeAnnotation?.typeAnnotation ??
        param?.typeAnnotation?.typeAnnotation;
      if (!typeAnn) continue;
      collectTypeReferenceNames(typeAnn, importedNames, valueReferenced);
    }
  }
}

/**
 * Recursively extract identifier names from a TS type expression and mark
 * any that match an imported name as value-referenced.
 */
function collectTypeReferenceNames(
  typeNode: any,
  importedNames: Set<string>,
  valueReferenced: Set<string>,
): void {
  if (!typeNode || typeof typeNode !== 'object') return;
  if (typeNode.type === 'TSTypeReference' && typeNode.typeName) {
    const name = typeNode.typeName.name;
    if (name && importedNames.has(name)) {
      valueReferenced.add(name);
    }
    // Walk type arguments too (e.g. Foo<Bar>)
    if (typeNode.typeArguments) {
      collectTypeReferenceNames(
        typeNode.typeArguments,
        importedNames,
        valueReferenced,
      );
    }
  } else if (
    typeNode.type === 'TSUnionType' ||
    typeNode.type === 'TSIntersectionType'
  ) {
    for (const t of typeNode.types || []) {
      collectTypeReferenceNames(t, importedNames, valueReferenced);
    }
  } else if (Array.isArray(typeNode)) {
    for (const t of typeNode) {
      collectTypeReferenceNames(t, importedNames, valueReferenced);
    }
  } else if (typeNode.params) {
    // TSTypeParameterInstantiation
    for (const t of typeNode.params) {
      collectTypeReferenceNames(t, importedNames, valueReferenced);
    }
  }
}

/**
 * Analyse compiled TypeScript source and return the set of imported names
 * that are only referenced in type positions (type annotations, implements
 * clauses, generics, etc.) and can safely be elided.
 *
 * Uses oxc-parser for fast, Rust-based AST analysis — no type-checker needed.
 */
export function detectTypeOnlyImportNames(code: string): Set<string> {
  return analyzeTypeOnlyImports(code).typeOnlyNames;
}

/**
 * Apply import elision edits to a MagicString instance using positions from
 * a parsed AST.  Shared logic for both the string-based and MagicString APIs.
 */
function applyElisionEdits(
  ms: MagicString,
  ast: any,
  src: string,
  typeOnlyNames: Set<string>,
): boolean {
  let edited = false;

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
    while (
      declEnd < src.length &&
      (src[declEnd] === '\n' || src[declEnd] === '\r')
    )
      declEnd++;

    const keepDefault = defaultSpec && !elideDefault;
    const hasKeptNamed = keptNamed.length > 0;

    if (!keepDefault && !hasKeptNamed) {
      // Remove entire import declaration
      ms.remove(node.start, declEnd);
      edited = true;
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
      const quote = src[node.source.start]; // preserve original quote style
      ms.overwrite(
        node.start,
        node.end,
        `import ${parts.join(', ')} from ${quote}${source}${quote};`,
      );
      edited = true;
    }
  }

  return edited;
}

/**
 * Elide import specifiers (or entire import declarations) for names that are
 * only used in type positions. Operates on the compiler's TypeScript output
 * (before OXC strips remaining TS syntax).
 *
 * Returns the modified source code, or the original if nothing was elided.
 */
export function elideTypeOnlyImports(code: string): string {
  const { ast, typeOnlyNames } = analyzeTypeOnlyImports(code);
  if (typeOnlyNames.size === 0) return code;

  const ms = new MagicString(code);
  const edited = applyElisionEdits(ms, ast, code, typeOnlyNames);
  return edited ? ms.toString() : code;
}

/**
 * Elide type-only imports directly on a MagicString instance, so that
 * subsequent `ms.generateMap()` calls produce an accurate sourcemap.
 *
 * Detects type-only names from `ms.toString()` (the fully-mutated code),
 * but reads import positions from `ms.original` (the coordinate system
 * MagicString expects).
 */
export function elideTypeOnlyImportsMagicString(ms: MagicString): void {
  const typeOnlyNames = detectTypeOnlyImportNames(ms.toString());
  if (typeOnlyNames.size === 0) return;

  // Parse the original source to get positions in MagicString's coordinate system
  const ast = parseSync('file.ts', ms.original).program;
  applyElisionEdits(ms, ast, ms.original, typeOnlyNames);
}
