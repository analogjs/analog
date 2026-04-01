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

/** Build import path map: className → modulePath from source file imports. */
export function buildImportMap(sf: ts.SourceFile): Map<string, string> {
  const result = new Map<string, string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const modulePath = (stmt.moduleSpecifier as ts.StringLiteral).text;
    const clause = stmt.importClause;
    if (clause.name) result.set(clause.name.text, modulePath);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        result.set(el.name.text, modulePath);
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

    for (const el of blockElements) {
      const className = selectorToClass.get(el);
      if (className && deferredImports.has(className)) {
        const modulePath = importMap.get(className)!;
        // () => import('./path').then(m => m.ClassName)
        blockDeps.push(
          new o.ArrowFunctionExpr(
            [],
            new o.DynamicImportExpr(new o.LiteralExpr(modulePath)),
          ),
        );
      }
    }

    if (blockDeps.length > 0) {
      // () => [import('./a').then(...), import('./b').then(...)]
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
