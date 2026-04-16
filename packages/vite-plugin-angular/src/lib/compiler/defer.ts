import * as ts from 'typescript';
import * as o from '@angular/compiler';
import { ComponentRegistry } from './registry.js';

/** Recursively collect all DeferredBlock nodes from a template AST. */
export function collectDeferBlocks(nodes: any[]): any[] {
  const result: any[] = [];
  function walk(node: any) {
    if (!node) return;
    if (node.constructor?.name === 'DeferredBlock') {
      result.push(node);
    }
    // Walk all possible child structures across block types:
    // Element/Template: children
    // IfBlock: branches (each has children)
    // ForLoopBlock: children, empty (has children)
    // SwitchBlock: cases (each has children)
    // DeferredBlock: children, placeholder/loading/error (each has children)
    if (Array.isArray(node.children)) node.children.forEach(walk);
    if (Array.isArray(node.branches)) node.branches.forEach(walk);
    if (Array.isArray(node.cases)) node.cases.forEach(walk);
    if (node.empty?.children) node.empty.children.forEach(walk);
    if (node.placeholder?.children) node.placeholder.children.forEach(walk);
    if (node.loading?.children) node.loading.children.forEach(walk);
    if (node.error?.children) node.error.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Collect element tag names from template AST nodes recursively. */
export function collectElementNames(nodes: any[]): Set<string> {
  const result = new Set<string>();
  function walk(node: any) {
    if (!node) return;
    if (node.constructor?.name === 'Element') result.add(node.name);
    if (Array.isArray(node.children)) node.children.forEach(walk);
    if (Array.isArray(node.branches)) node.branches.forEach(walk);
    if (Array.isArray(node.cases)) node.cases.forEach(walk);
    if (node.empty?.children) node.empty.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Information about how a class is imported. */
export interface ImportInfo {
  /** Module path from the import statement. */
  path: string;
  /** Whether the class was imported as a default import (`import X from`). */
  isDefault: boolean;
  /**
   * Original exported name on the source module's namespace. For
   * `import { HeavyWidget as Widget } from './heavy'`, the local
   * binding is `Widget` but the namespace exposes `HeavyWidget` —
   * `await import('./heavy')` returns `{ HeavyWidget }`, not
   * `{ Widget }`. Defer dependency emit must use the exported name,
   * not the local alias, or the lookup resolves to `undefined` at
   * runtime.
   */
  exportName: string;
}

/**
 * Build import info map: localName → { path, isDefault, exportName }
 * from source file imports. Tracks default vs named imports plus the
 * original exported name so the defer dependency generator can emit
 * `import('./p').then(m => m.default)` for default imports and
 * `import('./p').then(m => m.OriginalExportName)` for aliased named
 * imports.
 */
export function buildImportMap(sf: ts.SourceFile): Map<string, ImportInfo> {
  const result = new Map<string, ImportInfo>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const path = (stmt.moduleSpecifier as ts.StringLiteral).text;
    const clause = stmt.importClause;
    if (clause.name) {
      result.set(clause.name.text, {
        path,
        isDefault: true,
        exportName: 'default',
      });
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        // `import { Foo as Bar }` → propertyName is `Foo`, name is `Bar`.
        // `import { Foo }`        → propertyName is undefined.
        const exportName = el.propertyName?.text ?? el.name.text;
        const info: ImportInfo = { path, isDefault: false, exportName };
        // Key the map by BOTH the local binding and the original export
        // name. The defer-dep lookup uses the className from the
        // registry — which is always the original class name from the
        // source file (`HeavyWidget`), not the consumer's local alias
        // (`Widget`). Without the export-name key, aliased imports
        // would silently produce no defer dependency at all.
        result.set(el.name.text, info);
        if (exportName !== el.name.text) {
          result.set(exportName, info);
        }
      }
    }
  }
  return result;
}

/**
 * Build defer block dependency map with dynamic import() expressions.
 *
 * For each defer block, identifies which imported components are only used
 * inside defer blocks (not in the eager template), and generates dynamic
 * import expressions for lazy loading.
 *
 * Returns:
 * - blocks: Map<DeferredBlock, Expression | null> for compileComponentFromMetadata
 * - deferredImports: Set<string> of class names that should be removed from static imports
 */
export function buildDeferDependencyMap(
  parsedTemplate: any,
  sourceFile: ts.SourceFile,
  registry: ComponentRegistry | undefined,
  localSelectors: Map<string, string>,
): { blocks: Map<any, any>; deferredImports: Set<string> } {
  const deferBlocks = collectDeferBlocks(parsedTemplate.nodes);
  if (deferBlocks.length === 0) {
    return { blocks: new Map(), deferredImports: new Set() };
  }

  // Collect all element names in eager (non-defer) template parts
  const allElements = collectElementNames(parsedTemplate.nodes);
  const deferElements = new Set<string>();
  for (const block of deferBlocks) {
    const elements = collectElementNames(block.children || []);
    for (const el of elements) deferElements.add(el);
  }
  // Eager elements = all elements minus those only in defer blocks
  // (An element is eager if it appears anywhere outside defer blocks too)
  // Simple approach: collect elements from non-defer top-level nodes
  const eagerElements = new Set<string>();
  for (const node of parsedTemplate.nodes) {
    if (node.constructor?.name !== 'DeferredBlock') {
      const names = collectElementNames([node]);
      for (const n of names) eagerElements.add(n);
    }
  }

  // Build selector → className map from registry + local selectors
  const selectorToClass = new Map<string, string>();
  if (registry) {
    for (const [className, entry] of registry) {
      if (entry.selector) selectorToClass.set(entry.selector, className);
    }
  }
  for (const [className, selector] of localSelectors) {
    selectorToClass.set(selector, className);
  }

  // Build className → importPath map
  const importMap = buildImportMap(sourceFile);

  // Find defer-only component class names
  const deferredImports = new Set<string>();
  const deferOnlyElements = new Set<string>();
  for (const el of deferElements) {
    if (!eagerElements.has(el)) deferOnlyElements.add(el);
  }

  for (const el of deferOnlyElements) {
    const className = selectorToClass.get(el);
    if (className && importMap.has(className)) {
      deferredImports.add(className);
    }
  }

  // Build the blocks map with dependency functions
  const blocks = new Map<any, any>();
  for (const block of deferBlocks) {
    const blockElements = collectElementNames(block.children || []);
    const blockDeps: any[] = [];
    // Within a single block, dedupe by `${path}#${symbolName}` so two
    // refs to the same component don't generate two import expressions.
    const seenInBlock = new Set<string>();

    for (const el of blockElements) {
      const className = selectorToClass.get(el);
      if (!className || !deferredImports.has(className)) continue;
      const info = importMap.get(className)!;
      // Use the original exported name (tracked by buildImportMap) so
      // aliased imports like `import { HeavyWidget as Widget }` resolve
      // to `m.HeavyWidget` instead of `m.Widget` (which would be
      // `undefined` on the module namespace).
      const symbolName = info.exportName;
      const key = `${info.path}#${symbolName}`;
      if (seenInBlock.has(key)) continue;
      seenInBlock.add(key);
      // import('./path').then(m => m.ClassName) — or `m.default` for
      // default imports. Without the `.then(...)` resolver Angular's
      // runtime gets a module namespace and can't find the class.
      // `FnParam` and the `variable()` helper aren't on the top-level
      // namespace; they live in the `outputAst` sub-namespace.
      const ast: any = (o as any).outputAst;
      const mVar = ast.variable('m');
      const innerFn = ast.arrowFn(
        [new ast.FnParam('m', ast.DYNAMIC_TYPE)],
        new o.ReadPropExpr(mVar, symbolName),
      );
      const importExpr = new o.InvokeFunctionExpr(
        new o.ReadPropExpr(
          new o.DynamicImportExpr(new o.LiteralExpr(info.path)),
          'then',
        ),
        [innerFn],
      );
      blockDeps.push(new o.ArrowFunctionExpr([], importExpr));
    }

    if (blockDeps.length > 0) {
      // () => [import('./a').then(m => m.A), import('./b').then(m => m.default)]
      blocks.set(
        block,
        new o.ArrowFunctionExpr([], new o.LiteralArrayExpr(blockDeps)),
      );
    } else {
      blocks.set(block, null);
    }
  }

  return { blocks, deferredImports };
}
