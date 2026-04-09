import { parseSync } from 'oxc-parser';
import { COMPILABLE_DECORATORS } from './constants.js';

export interface RegistryInput {
  classPropertyName: string;
  bindingPropertyName: string;
  isSignal: boolean;
  required: boolean;
  transform?: any;
}

export interface RegistryEntry {
  /** CSS selector for components/directives, pipe name for pipes, class name for NgModules */
  selector: string;
  /** What kind of Angular declaration this is */
  kind: 'component' | 'directive' | 'pipe' | 'ngmodule' | 'tuple';
  /** The pipe name (only for pipes) */
  pipeName?: string;
  /** Exported class names (only for NgModules) */
  exports?: string[];
  /**
   * Member class names (only for `tuple` kind) — produced by top-level
   * `export const X = [A, B, C] as const` style barrels common in
   * helm/spartan-style libraries. The compiler expands these into the
   * underlying directives when they appear in another component's
   * `imports` array, mirroring how Angular's official compiler resolves
   * static `imports` references at compile time.
   */
  members?: string[];
  /** The source file this declaration was found in */
  fileName: string;
  /** The class name */
  className: string;
  /** Input bindings (from signal APIs and @Input decorators) */
  inputs?: Record<string, RegistryInput>;
  /** Output bindings (from signal APIs and @Output decorators) */
  outputs?: Record<string, string>;
  /** The package this declaration was scanned from (e.g. "@angular/cdk") */
  sourcePackage?: string;
}

/** Maps class name → registry entry */
export type ComponentRegistry = Map<string, RegistryEntry>;

const DECORATOR_RE = new RegExp(`@(${[...COMPILABLE_DECORATORS].join('|')})`);

/**
 * Lightweight scan of a TypeScript file to extract Angular decorator metadata
 * without performing full compilation. Uses OXC's native Rust parser for speed.
 */
export function scanFile(code: string, fileName: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];

  // Fast regex pre-filter — skip files with neither Angular decorators
  // nor a top-level `const X = [...]` that might be a directive tuple
  // barrel re-export.
  if (!DECORATOR_RE.test(code) && !/\bconst\s+\w+\s*=\s*\[/.test(code)) {
    return entries;
  }

  const { program } = parseSync(fileName, code);

  // First pass: collect tuple barrels — top-level `const X = [A, B, C]`
  // (with or without `export`/`as const`) where every element is a bare
  // class identifier. These are how spartan-style libraries expose a
  // group of directives behind a single import (e.g. `HlmSelectImports`).
  // Without registering them, the analog compiler treats the bare
  // identifier as an unknown directive and Angular's runtime never
  // matches the underlying classes.
  for (const node of program.body) {
    const varDecl =
      node.type === 'ExportNamedDeclaration' &&
      (node as any).declaration?.type === 'VariableDeclaration'
        ? (node as any).declaration
        : node.type === 'VariableDeclaration'
          ? node
          : null;
    if (!varDecl || varDecl.kind !== 'const') continue;
    for (const declarator of varDecl.declarations || []) {
      if (declarator.id?.type !== 'Identifier') continue;
      // Unwrap `arr as const` → ArrayExpression
      let init = declarator.init;
      if (init?.type === 'TSAsExpression') init = init.expression;
      if (init?.type !== 'ArrayExpression') continue;
      const members: string[] = [];
      let allClassRefs = true;
      for (const el of init.elements || []) {
        if (el?.type !== 'Identifier') {
          allClassRefs = false;
          break;
        }
        members.push(el.name);
      }
      if (!allClassRefs || members.length === 0) continue;
      const tupleName: string = declarator.id.name;
      entries.push({
        selector: tupleName,
        kind: 'tuple',
        members,
        fileName,
        className: tupleName,
      });
    }
  }

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
      if (!COMPILABLE_DECORATORS.has(decoratorName)) continue;

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
        // Extract inputs/outputs from class members
        const inputs: Record<string, RegistryInput> = {};
        const outputs: Record<string, string> = {};
        const members: any[] = decl.body?.body || [];

        for (const member of members) {
          if (member.type !== 'PropertyDefinition' || !member.key?.name)
            continue;
          const name: string = member.key.name;
          const init = member.value;

          // Signal APIs: input(), input.required(), model(), output()
          if (init?.type === 'CallExpression') {
            const callee = init.callee;
            let calleeName = '';
            if (callee?.type === 'Identifier') {
              calleeName = callee.name;
            } else if (
              callee?.type === 'StaticMemberExpression' ||
              callee?.type === 'MemberExpression'
            ) {
              calleeName =
                (callee.object?.name || '') +
                '.' +
                (callee.property?.name || '');
            }

            // Extract `alias` from an options object at the given
            // argument index. Used for input/model (options at index 1,
            // or 0 for the `.required` variants) and for output (options
            // at index 0). Without this, host-directive mappings that
            // reference the public name (e.g. `inputs: ['aria-label']`,
            // `outputs: ['publicEvent']`) fail to resolve.
            const aliasFromArg = (argIndex: number): string | null => {
              const optionsArg = init.arguments?.[argIndex];
              if (optionsArg?.type !== 'ObjectExpression') return null;
              for (const prop of optionsArg.properties || []) {
                if (prop.type !== 'ObjectProperty' && prop.type !== 'Property')
                  continue;
                const k = prop.key?.name ?? prop.key?.value;
                if (k !== 'alias') continue;
                const v = prop.value;
                if (
                  v?.type === 'StringLiteral' ||
                  (v?.type === 'Literal' && typeof v.value === 'string')
                ) {
                  return v.value;
                }
              }
              return null;
            };
            const inputAliasIndex =
              calleeName === 'input.required' || calleeName === 'model.required'
                ? 0
                : 1;

            if (calleeName === 'input' || calleeName === 'input.required') {
              const alias = aliasFromArg(inputAliasIndex);
              inputs[name] = {
                classPropertyName: name,
                bindingPropertyName: alias ?? name,
                isSignal: true,
                required: calleeName === 'input.required',
              };
            } else if (
              calleeName === 'model' ||
              calleeName === 'model.required'
            ) {
              const alias = aliasFromArg(inputAliasIndex);
              inputs[name] = {
                classPropertyName: name,
                bindingPropertyName: alias ?? name,
                isSignal: true,
                required: calleeName === 'model.required',
              };
              // outputs map is `{ classPropertyName: bindingName }` —
              // for a model, the class property is `name` and the
              // binding name is `${aliasOrName}Change`.
              outputs[name] = (alias ?? name) + 'Change';
            } else if (
              calleeName === 'output' ||
              calleeName === 'outputFromObservable'
            ) {
              // output() options at arg[0]; outputFromObservable(source,
              // opts?) options at arg[1].
              const alias = aliasFromArg(
                calleeName === 'outputFromObservable' ? 1 : 0,
              );
              outputs[name] = alias ?? name;
            }
          }

          // Decorator-based: @Input(), @Output()
          const memberDecorators: any[] = member.decorators || [];
          for (const mdec of memberDecorators) {
            const mexpr = mdec.expression;
            if (!mexpr) continue;
            const mdecName =
              mexpr.type === 'CallExpression'
                ? mexpr.callee?.name
                : mexpr.type === 'Identifier'
                  ? mexpr.name
                  : undefined;
            if (mdecName === 'Input') {
              const alias =
                mexpr.arguments?.[0]?.type === 'Literal'
                  ? mexpr.arguments[0].value
                  : name;
              inputs[name] = {
                classPropertyName: name,
                bindingPropertyName: alias || name,
                isSignal: false,
                required: false,
              };
            } else if (mdecName === 'Output') {
              const alias =
                mexpr.arguments?.[0]?.type === 'Literal'
                  ? mexpr.arguments[0].value
                  : name;
              outputs[name] = alias || name;
            }
          }
        }

        entries.push({
          selector: selector.split(',')[0].trim(),
          kind: decoratorName === 'Component' ? 'component' : 'directive',
          fileName,
          className,
          ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
          ...(Object.keys(outputs).length > 0 ? { outputs } : {}),
        });
      }
    }
  }

  return entries;
}
