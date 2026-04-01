import { parseSync } from 'oxc-parser';

export interface RegistryEntry {
  /** CSS selector for components/directives, pipe name for pipes, class name for NgModules */
  selector: string;
  /** What kind of Angular declaration this is */
  kind: 'component' | 'directive' | 'pipe' | 'ngmodule';
  /** The pipe name (only for pipes) */
  pipeName?: string;
  /** Exported class names (only for NgModules) */
  exports?: string[];
  /** The source file this declaration was found in */
  fileName: string;
  /** The class name */
  className: string;
}

/** Maps class name → registry entry */
export type ComponentRegistry = Map<string, RegistryEntry>;

const ANGULAR_DECORATORS = new Set([
  'Component',
  'Directive',
  'Pipe',
  'NgModule',
]);
const DECORATOR_RE = /@(Component|Directive|Pipe|NgModule)/;

/**
 * Lightweight scan of a TypeScript file to extract Angular decorator metadata
 * without performing full compilation. Uses OXC's native Rust parser for speed.
 */
export function scanFile(code: string, fileName: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];

  // Fast regex pre-filter before parsing
  if (!DECORATOR_RE.test(code)) {
    return entries;
  }

  const { program } = parseSync(fileName, code);

  for (const node of program.body) {
    // Handle `class Foo {}`, `export class Foo {}`, and `export default class Foo {}`
    const decl =
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
        ? (node as any).declaration
        : node;
    if (!decl || decl.type !== 'ClassDeclaration') continue;
    // Skip anonymous default exports (no name to register)
    if (!decl.id?.name) continue;

    const className: string = decl.id.name;
    const decorators: any[] = decl.decorators || [];

    for (const dec of decorators) {
      const expr = dec.expression;
      if (!expr || expr.type !== 'CallExpression') continue;

      const decoratorName: string = expr.callee?.name;
      if (!ANGULAR_DECORATORS.has(decoratorName)) continue;

      const arg = expr.arguments?.[0];
      if (!arg || arg.type !== 'ObjectExpression') continue;

      let selector: string | undefined;
      let pipeName: string | undefined;
      let moduleExports: string[] | undefined;

      for (const prop of arg.properties) {
        if (prop.type !== 'Property') continue;
        const key: string = prop.key?.name || prop.key?.value;
        const val = prop.value;

        if (
          key === 'selector' &&
          val?.type === 'Literal' &&
          typeof val.value === 'string'
        ) {
          selector = val.value;
        }
        if (
          key === 'name' &&
          val?.type === 'Literal' &&
          typeof val.value === 'string' &&
          decoratorName === 'Pipe'
        ) {
          pipeName = val.value;
        }
        if (
          key === 'exports' &&
          val?.type === 'ArrayExpression' &&
          decoratorName === 'NgModule'
        ) {
          moduleExports = val.elements
            .filter((e: any) => e?.type === 'Identifier')
            .map((e: any) => e.name);
        }
      }

      if (decoratorName === 'NgModule') {
        entries.push({
          selector: className,
          kind: 'ngmodule',
          exports: moduleExports || [],
          fileName,
          className,
        });
      } else if (decoratorName === 'Pipe' && pipeName) {
        entries.push({
          selector: pipeName,
          kind: 'pipe',
          pipeName,
          fileName,
          className,
        });
      } else if (selector) {
        entries.push({
          selector: selector.split(',')[0].trim(),
          kind: decoratorName === 'Component' ? 'component' : 'directive',
          fileName,
          className,
        });
      }
    }
  }

  return entries;
}
