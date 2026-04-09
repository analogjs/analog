import * as o from '@angular/compiler';
import { unwrapForwardRefOxc } from './utils.js';
import { SIGNAL_APIS } from './constants.js';

function getCallApi(call: any): { api: string; required: boolean } | null {
  const callee = call.callee;
  if (!callee) return null;

  if (callee.type === 'Identifier') {
    return { api: callee.name, required: false };
  }

  if (
    (callee.type === 'StaticMemberExpression' ||
      callee.type === 'MemberExpression') &&
    callee.object?.type === 'Identifier' &&
    callee.property?.name === 'required'
  ) {
    return { api: callee.object.name, required: true };
  }

  return null;
}

/**
 * Extract the string value from an OXC string literal or template literal node.
 *
 * If `consts` is provided, interpolated template literals (e.g.
 * `\`hello ${NAME}\``) are resolved when every `${...}` expression is a bare
 * `Identifier` whose name is present in the map. This lets metadata fields
 * such as `template:` reference module-level string constants via JS
 * template-literal interpolation:
 *
 *   const tw = `text-zinc-700 hover:text-zinc-900`;
 *   @Component({ template: `<a class="${tw}">x</a>` })
 *
 * Returns `null` if the node is not statically resolvable.
 */
function stringValue(node: any, consts?: Map<string, string>): string | null {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  if (node?.type === 'TemplateLiteral') {
    const quasis = node.quasis ?? [];
    const expressions = node.expressions ?? [];
    if (expressions.length === 0) {
      return quasis[0]?.value?.cooked ?? null;
    }
    if (!consts) return null;
    let result = '';
    for (let i = 0; i < quasis.length; i++) {
      const cooked = quasis[i]?.value?.cooked;
      if (cooked == null) return null;
      result += cooked;
      if (i < expressions.length) {
        const expr = expressions[i];
        if (expr?.type !== 'Identifier') return null;
        const resolved = consts.get(expr.name);
        if (resolved == null) return null;
        result += resolved;
      }
    }
    return result;
  }
  return null;
}

/** Check if an OXC node is a string-like literal. */
function isStringLike(node: any, consts?: Map<string, string>): boolean {
  return stringValue(node, consts) !== null;
}

/**
 * Walk the top-level statements of an OXC program and collect a map of
 * statically-resolvable string-valued `const NAME = ...` declarations.
 *
 * Used so decorator metadata fields like `template:` can reference
 * module-level Tailwind class chains (or any other string constants) via
 * JS template-literal interpolation. Resolution is iterative: a const may
 * reference earlier-resolved consts via `${other}` interpolation.
 *
 * Only `const` declarations are considered. Non-string initializers,
 * function calls, member access, and any expression that cannot be reduced
 * to a string at parse time are ignored.
 */
export function collectStringConstants(oxcProgram: any): Map<string, string> {
  const rawDecls = new Map<string, any>();
  for (const stmt of oxcProgram?.body || []) {
    const decl =
      stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (!decl || decl.type !== 'VariableDeclaration' || decl.kind !== 'const')
      continue;
    for (const d of decl.declarations || []) {
      if (d.id?.type === 'Identifier' && d.init) {
        rawDecls.set(d.id.name, d.init);
      }
    }
  }

  const resolved = new Map<string, string>();
  // Iterative fixpoint: each pass resolves consts whose dependencies are
  // already known. Bounded by the number of declarations to prevent cycles.
  for (let pass = 0; pass < rawDecls.size + 1; pass++) {
    let progress = false;
    for (const [name, init] of rawDecls) {
      if (resolved.has(name)) continue;
      const value = stringValue(init, resolved);
      if (value !== null) {
        resolved.set(name, value);
        progress = true;
      }
    }
    if (!progress) break;
  }
  return resolved;
}

/** Get the property key name from an OXC object property. */
function propKeyName(prop: any): string | null {
  if (!prop.key) return null;
  return prop.key.name ?? prop.key.value ?? null;
}

/**
 * Extract decorator metadata from an OXC decorator AST node.
 * Parses @Component, @Directive, @Pipe, @Injectable, @NgModule arguments.
 *
 * `stringConsts`, when provided, lets string-typed metadata fields
 * (`template`, `selector`, `templateUrl`, `styles`, `styleUrl`, `styleUrls`,
 * `name`, `exportAs`, `providedIn`) resolve module-level string constants
 * referenced via template-literal interpolation, e.g.
 * `template: \`<div class="${tw}">x</div>\``.
 */
export function extractMetadata(
  dec: any | undefined,
  sourceCode: string,
  stringConsts?: Map<string, string>,
): any {
  if (!dec) return null;
  const call = dec.expression;
  if (!call || call.type !== 'CallExpression') return null;
  const arg = call.arguments?.[0];
  const meta: any = {
    hostRaw: {},
    inputs: {},
    outputs: {},
    standalone: true,
    imports: [],
    providers: null,
    viewProviders: null,
    animations: null,
    changeDetection: null,
    encapsulation: null,
    preserveWhitespaces: false,
    exportAs: null,
    selector: undefined,
    styles: [],
    templateUrl: null,
    styleUrls: [],
  };
  if (!arg || arg.type !== 'ObjectExpression') return meta;

  for (const p of arg.properties || []) {
    if (p.type !== 'ObjectProperty' && p.type !== 'Property') continue;
    const key = propKeyName(p);
    if (!key) continue;
    const valNode = p.value;
    const valText = sourceCode.slice(valNode.start, valNode.end);

    switch (key) {
      case 'host':
        if (valNode.type === 'ObjectExpression') {
          for (const hp of valNode.properties || []) {
            if (hp.type !== 'ObjectProperty' && hp.type !== 'Property')
              continue;
            const hKey = propKeyName(hp);
            if (!hKey) continue;
            // Prefer the parsed string value so embedded quotes (e.g. the
            // empty `""` in `'expr ? "" : null'`) survive. Falling back to
            // the source slice for non-string values keeps prior behavior
            // for unusual host bindings (e.g. references to constants).
            const sv = stringValue(hp.value, stringConsts);
            const hVal =
              sv !== null
                ? sv
                : sourceCode
                    .slice(hp.value.start, hp.value.end)
                    .replace(/^['"`]|['"`]$/g, '');
            meta.hostRaw[hKey.replace(/^['"`]|['"`]$/g, '')] = hVal;
          }
        }
        break;
      case 'changeDetection':
        meta.changeDetection = valText.includes('OnPush') ? 0 : 1;
        break;
      case 'encapsulation':
        meta.encapsulation = valText.includes('None')
          ? 2
          : valText.includes('ShadowDom')
            ? 3
            : 0;
        break;
      case 'preserveWhitespaces':
        meta.preserveWhitespaces = valText === 'true';
        break;
      case 'pure':
      case 'standalone':
        meta[key] = valText !== 'false';
        break;
      case 'template':
      case 'selector':
      case 'name':
      case 'exportAs':
      case 'templateUrl':
      case 'providedIn': {
        const sv = stringValue(valNode, stringConsts);
        if (sv !== null) {
          meta[key] = sv;
        } else if (valNode.type === 'TemplateLiteral') {
          // Template literal with `${...}` interpolations that couldn't
          // all be resolved at parse time (e.g. they reference imports
          // or non-string values). The previous fallback stripped every
          // quote character from the source, which silently corrupted
          // templates such as `<a class="${cls} foo">…</a>` into
          // `<a class=${cls} foo>…</a>` — making Angular's HTML parser
          // fail with confusing errors like `Opening tag "a" not
          // terminated`. Instead, walk the quasis and substitute each
          // unresolved interpolation with the empty string so the
          // surrounding HTML (including quoted attributes) is preserved.
          const quasis = valNode.quasis ?? [];
          const expressions = valNode.expressions ?? [];
          let result = '';
          for (let i = 0; i < quasis.length; i++) {
            result += quasis[i]?.value?.cooked ?? '';
            if (i < expressions.length) {
              const expr = expressions[i];
              if (expr?.type === 'Identifier') {
                const resolved = stringConsts?.get(expr.name);
                if (resolved != null) {
                  result += resolved;
                  continue;
                }
              }
              // Unresolvable — substitute empty string. This keeps the
              // surrounding HTML well-formed even if the resulting class
              // list is incomplete.
            }
          }
          meta[key] = result;
        } else {
          // Non-string, non-template-literal expression. Strip only the
          // outermost JS string delimiters, not every embedded quote.
          meta[key] = valText.replace(/^['"`]|['"`]$/g, '');
        }
        if (key === 'exportAs') meta.exportAs = [meta.exportAs];
        break;
      }
      case 'styleUrl': {
        const sv = stringValue(valNode, stringConsts);
        meta.styleUrls = [sv !== null ? sv : valText.replace(/['"`]/g, '')];
        break;
      }
      case 'styleUrls':
        if (valNode.type === 'ArrayExpression') {
          meta.styleUrls = (valNode.elements || []).map((e: any) => {
            const sv = stringValue(e, stringConsts);
            return sv !== null
              ? sv
              : sourceCode.slice(e.start, e.end).replace(/['"`]/g, '');
          });
        }
        break;
      case 'styles':
        if (valNode.type === 'ArrayExpression') {
          meta.styles = (valNode.elements || []).map((e: any) => {
            const sv = stringValue(e, stringConsts);
            return sv !== null
              ? sv
              : sourceCode.slice(e.start, e.end).replace(/['"`]/g, '');
          });
        } else {
          const sv = stringValue(valNode, stringConsts);
          if (sv !== null) meta.styles = [sv];
        }
        break;
      case 'imports':
      case 'providers':
      case 'viewProviders':
      case 'animations':
      case 'rawImports':
      case 'declarations':
      case 'exports':
      case 'bootstrap':
        if (valNode.type === 'ArrayExpression') {
          meta[key] = (valNode.elements || []).map(
            (e: any) => new o.WrappedNodeExpr(unwrapForwardRefOxc(e)),
          );
        }
        break;
      case 'hostDirectives':
        if (valNode.type === 'ArrayExpression') {
          meta.hostDirectives = (valNode.elements || [])
            .map((el: any) => {
              // Bare identifier: hostDirectives: [MatTooltip]
              if (el.type === 'Identifier' || el.type === 'CallExpression') {
                const unwrapped = unwrapForwardRefOxc(el);
                const ref = {
                  value: new o.WrappedNodeExpr(unwrapped),
                  type: new o.WrappedNodeExpr(unwrapped),
                };
                return {
                  directive: ref,
                  isForwardReference: el.type === 'CallExpression',
                  inputs: null,
                  outputs: null,
                };
              }
              // Object form: { directive: MatTooltip, inputs: [...], outputs: [...] }
              if (el.type === 'ObjectExpression') {
                let directiveNode: any = null;
                let isForwardRef = false;
                let inputs: Record<string, string> | null = null;
                let outputs: Record<string, string> | null = null;
                for (const prop of el.properties || []) {
                  if (
                    prop.type !== 'ObjectProperty' &&
                    prop.type !== 'Property'
                  )
                    continue;
                  const pName = propKeyName(prop);
                  if (pName === 'directive') {
                    directiveNode = unwrapForwardRefOxc(prop.value);
                    isForwardRef =
                      prop.value?.type === 'CallExpression' &&
                      sourceCode
                        .slice(prop.value.start, prop.value.end)
                        .includes('forwardRef');
                  } else if (
                    pName === 'inputs' &&
                    prop.value?.type === 'ArrayExpression'
                  ) {
                    inputs = {};
                    for (const e of prop.value.elements || []) {
                      const sv = stringValue(e);
                      if (sv !== null) {
                        const [source, alias = source] = sv
                          .split(':')
                          .map((part: string) => part.trim());
                        if (source) inputs[source] = alias;
                      }
                    }
                  } else if (
                    pName === 'outputs' &&
                    prop.value?.type === 'ArrayExpression'
                  ) {
                    outputs = {};
                    for (const e of prop.value.elements || []) {
                      const sv = stringValue(e);
                      if (sv !== null) {
                        const [source, alias = source] = sv
                          .split(':')
                          .map((part: string) => part.trim());
                        if (source) outputs[source] = alias;
                      }
                    }
                  }
                }
                if (directiveNode) {
                  const ref = {
                    value: new o.WrappedNodeExpr(directiveNode),
                    type: new o.WrappedNodeExpr(directiveNode),
                  };
                  return {
                    directive: ref,
                    isForwardReference: isForwardRef,
                    inputs,
                    outputs,
                  };
                }
              }
              return null;
            })
            .filter(Boolean);
        }
        break;
      default:
        meta[key] = valText.replace(/['"`]/g, '');
    }
  }
  return meta;
}

/**
 * Detect signal-based APIs on class members: input(), model(), output(),
 * viewChild(), contentChild(), viewChildren(), contentChildren().
 */
export function detectSignals(classNode: any, sourceCode: string) {
  const inputs: any = {},
    outputs: any = {},
    viewQueries: any[] = [],
    contentQueries: any[] = [];

  const members: any[] = classNode.body?.body || [];

  for (const m of members) {
    if (
      m.type !== 'PropertyDefinition' ||
      !m.key?.name ||
      !m.value ||
      m.value.type !== 'CallExpression'
    )
      continue;

    const name: string = m.key.name;
    const signalCall = getCallApi(m.value);
    if (!signalCall) continue;

    const { api, required } = signalCall;
    if (!SIGNAL_APIS.has(api)) continue;

    const args: any[] = m.value.arguments || [];

    // 1. SIGNAL INPUTS (Standard & Required)
    if (api === 'input') {
      let transform: any = null;
      let alias: string | null = null;
      const optionsArg = required ? args[0] : args[1];
      if (optionsArg?.type === 'ObjectExpression') {
        for (const prop of optionsArg.properties || []) {
          if (prop.type !== 'ObjectProperty' && prop.type !== 'Property')
            continue;
          const k = propKeyName(prop);
          if (k === 'transform') {
            transform = new o.WrappedNodeExpr(prop.value);
          } else if (k === 'alias') {
            const sv = stringValue(prop.value);
            if (sv !== null) alias = sv;
          }
        }
      }
      inputs[name] = {
        classPropertyName: name,
        // The binding (public) name is the alias if provided, otherwise
        // the class property name. Without honoring `alias`, host
        // directives that map by public name (e.g.
        // `inputs: ['aria-label']` against `ariaLabel = input(null, {
        // alias: 'aria-label' })`) fail at runtime with NG0311.
        bindingPropertyName: alias ?? name,
        isSignal: true,
        required,
        transform,
      };
    }

    // 2. MODEL SIGNALS (Writable Inputs)
    else if (api === 'model') {
      // model() supports the same options object as input(); honor `alias`
      // for the same reason (host-directive mappings use the public name).
      let alias: string | null = null;
      const optionsArg = required ? args[0] : args[1];
      if (optionsArg?.type === 'ObjectExpression') {
        for (const prop of optionsArg.properties || []) {
          if (prop.type !== 'ObjectProperty' && prop.type !== 'Property')
            continue;
          if (propKeyName(prop) === 'alias') {
            const sv = stringValue(prop.value);
            if (sv !== null) alias = sv;
          }
        }
      }
      inputs[name] = {
        classPropertyName: name,
        bindingPropertyName: alias ?? name,
        isSignal: true,
      };
      // The compiled `outputs` field is `{ classPropertyName: bindingName }`.
      // Angular inverts this at runtime via
      // `parseAndConvertOutputsForDefinition`, producing the lookup map
      // `{ bindingName: classPropertyName }` used by `listenToOutput`.
      // For a `model()` signal, the class property is `name` and the
      // binding event is `${aliasOrName}Change`, and the model signal
      // itself is the subscribable, so `instance[name]` is what
      // `listenToOutput` needs to resolve.
      outputs[name] = (alias ?? name) + 'Change';
    }

    // 3. SIGNAL QUERIES (viewChild, contentChild)
    else if (
      api === 'viewChild' ||
      api === 'viewChildren' ||
      api === 'contentChild' ||
      api === 'contentChildren'
    ) {
      const isViewQuery = api === 'viewChild' || api === 'viewChildren';
      const isChildrenQuery =
        api === 'viewChildren' || api === 'contentChildren';

      const firstArg = args[0];
      const sv = stringValue(firstArg);

      // Parse the optional second-arg options object for `read` and
      // (content queries only) `descendants`. Without this, queries like
      // `viewChild('ref', { read: ElementRef })` and
      // `contentChildren(Foo, { descendants: false })` silently lose
      // their options at runtime.
      let read: any = null;
      // Default: content queries match descendants only when explicitly
      // requested (Angular's `getContentQueriesTargetingFirst` defaults
      // to `false`); view queries always inspect descendants.
      let descendants = isViewQuery ? true : false;
      const optArg = args[1];
      if (optArg?.type === 'ObjectExpression') {
        for (const prop of optArg.properties || []) {
          if (prop.type !== 'ObjectProperty' && prop.type !== 'Property')
            continue;
          const k = propKeyName(prop);
          if (k === 'read') {
            read = new o.WrappedNodeExpr(unwrapForwardRefOxc(prop.value));
          } else if (k === 'descendants') {
            const t = prop.value?.type;
            if (
              t === 'BooleanLiteral' ||
              (t === 'Literal' && typeof prop.value.value === 'boolean')
            ) {
              descendants = prop.value.value;
            }
          }
        }
      }

      const query = {
        propertyName: name,
        // Class predicates must be wrapped in an `R3QueryReference`
        // (`{ forwardRef, expression }`); Angular's `getQueryPredicate`
        // dispatches on `predicate.forwardRef` and reads
        // `predicate.expression`, so a bare `WrappedNodeExpr` is silently
        // dropped to `undefined` and emitted as `null`, leaving the query
        // with no target. `0 = ForwardRefHandling.None`.
        predicate:
          sv !== null
            ? [sv]
            : { forwardRef: 0, expression: new o.WrappedNodeExpr(firstArg) },
        first: !isChildrenQuery,
        descendants,
        read,
        static: false,
        emitFlags: 0,
        isSignal: true,
      };

      if (isViewQuery) viewQueries.push(query);
      else contentQueries.push(query);
    }

    // 4. STANDARD OUTPUTS (output() and outputFromObservable())
    else if (api === 'output' || api === 'outputFromObservable') {
      let alias = name;
      const optArg = args[0];
      if (optArg?.type === 'ObjectExpression') {
        for (const prop of optArg.properties || []) {
          if (
            (prop.type === 'ObjectProperty' || prop.type === 'Property') &&
            propKeyName(prop) === 'alias'
          ) {
            const sv = stringValue(prop.value);
            if (sv !== null) alias = sv;
          }
        }
      }
      outputs[name] = alias;
    }
  }

  return { inputs, outputs, viewQueries, contentQueries };
}

/**
 * Detect decorator-based field metadata: @Input, @Output, @ViewChild,
 * @ContentChild, @ViewChildren, @ContentChildren, @HostBinding, @HostListener.
 */
export function detectFieldDecorators(classNode: any, sourceCode: string) {
  const inputs: any = {};
  const outputs: any = {};
  const viewQueries: any[] = [];
  const contentQueries: any[] = [];
  const hostProperties: Record<string, string> = {};
  const hostListeners: Record<string, string> = {};

  const members: any[] = classNode.body?.body || [];

  for (const member of members) {
    const decorators: any[] = member.decorators || [];
    if (decorators.length === 0) continue;

    const memberName: string = member.key?.name || '';

    for (const dec of decorators) {
      const expr = dec.expression;
      if (!expr || expr.type !== 'CallExpression') continue;
      const decName: string | undefined = expr.callee?.name;
      if (!decName) continue;
      const args: any[] = expr.arguments || [];

      switch (decName) {
        case 'Input': {
          let bindingName = memberName;
          let required = false;
          let transformFunction: any = null;

          if (args.length > 0) {
            const arg = args[0];
            const sv = stringValue(arg);
            if (sv !== null) {
              bindingName = sv;
            } else if (arg.type === 'ObjectExpression') {
              for (const prop of arg.properties || []) {
                if (prop.type !== 'ObjectProperty' && prop.type !== 'Property')
                  continue;
                const k = propKeyName(prop);
                if (k === 'alias') {
                  const asv = stringValue(prop.value);
                  if (asv !== null) bindingName = asv;
                }
                if (k === 'required')
                  required =
                    sourceCode.slice(prop.value.start, prop.value.end) ===
                    'true';
                if (k === 'transform')
                  transformFunction = new o.WrappedNodeExpr(prop.value);
              }
            }
          }

          inputs[memberName] = {
            classPropertyName: memberName,
            bindingPropertyName: bindingName,
            isSignal: false,
            required,
            transformFunction,
          };
          break;
        }

        case 'Output': {
          const sv = args.length > 0 ? stringValue(args[0]) : null;
          const alias = sv !== null ? sv : memberName;
          outputs[memberName] = alias;
          break;
        }

        case 'ViewChild':
        case 'ViewChildren':
        case 'ContentChild':
        case 'ContentChildren': {
          const isView = decName.startsWith('View');
          const isFirst = decName === 'ViewChild' || decName === 'ContentChild';

          // Default predicate when no argument is given is the member
          // name. Class predicates (the non-string case) must be wrapped
          // in an `R3QueryReference` (`{ forwardRef, expression }`) so
          // Angular's `getQueryPredicate` can dispatch on `forwardRef`
          // and read `.expression`. A bare `WrappedNodeExpr` is silently
          // dropped to undefined and emitted as `null`.
          let predicate: any = [memberName];
          if (args.length > 0) {
            const pred = args[0];
            const sv = stringValue(pred);
            if (sv !== null) {
              predicate = [sv];
            } else {
              predicate = {
                forwardRef: 0,
                expression: new o.WrappedNodeExpr(unwrapForwardRefOxc(pred)),
              };
            }
          }

          let read: any = null;
          let isStatic = false;
          let descendants = isView || isFirst;

          if (args.length > 1 && args[1]?.type === 'ObjectExpression') {
            for (const prop of args[1].properties || []) {
              if (prop.type !== 'ObjectProperty' && prop.type !== 'Property')
                continue;
              const k = propKeyName(prop);
              if (k === 'read') read = new o.WrappedNodeExpr(prop.value);
              if (k === 'static')
                isStatic =
                  sourceCode.slice(prop.value.start, prop.value.end) === 'true';
              if (k === 'descendants')
                descendants =
                  sourceCode.slice(prop.value.start, prop.value.end) === 'true';
            }
          }

          const query = {
            propertyName: memberName,
            predicate,
            first: isFirst,
            descendants,
            read,
            static: isStatic,
            emitFlags: 0,
            isSignal: false,
          };

          if (isView) viewQueries.push(query);
          else contentQueries.push(query);
          break;
        }

        case 'HostBinding': {
          const sv = args.length > 0 ? stringValue(args[0]) : null;
          const target = sv !== null ? sv : memberName;
          hostProperties[target] = memberName;
          break;
        }

        case 'HostListener': {
          const sv = args.length > 0 ? stringValue(args[0]) : null;
          if (sv !== null) {
            const event = sv;
            let handler = `${memberName}()`;
            if (args.length > 1 && args[1]?.type === 'ArrayExpression') {
              const handlerArgs = (args[1].elements || [])
                .map((e: any) => stringValue(e))
                .filter((v: string | null): v is string => v !== null)
                .join(', ');
              handler = `${memberName}(${handlerArgs})`;
            }
            hostListeners[event] = handler;
          }
          break;
        }
      }
    }
  }

  return {
    inputs,
    outputs,
    viewQueries,
    contentQueries,
    hostProperties,
    hostListeners,
  };
}

/**
 * Analyze constructor parameters for dependency injection.
 * Returns:
 * - R3DependencyMetadata[] for normal constructors
 * - null if class extends another without own constructor (use inherited factory)
 * - 'invalid' if any parameter has a type-only import token
 *
 * Accepts an OXC ClassDeclaration node and the original source string.
 */
export function extractConstructorDeps(
  classNode: any,
  sourceCode: string,
  typeOnlyImports: Set<string>,
): any[] | 'invalid' | null {
  const heritage: any[] = classNode.superClass ? [classNode.superClass] : [];
  const hasSuper = heritage.length > 0;

  const members: any[] = classNode.body?.body || [];
  const ctor = members.find(
    (m: any) => m.type === 'MethodDefinition' && m.kind === 'constructor',
  );

  if (!ctor) {
    return hasSuper ? null : [];
  }

  const params: any[] = ctor.value?.params?.items || ctor.value?.params || [];
  const deps: any[] = [];
  let invalid = false;

  for (const param of params) {
    let token: string | null = null;
    let attributeNameType: any = null;
    let host = false,
      optional = false,
      self = false,
      skipSelf = false;

    // Handle TSParameterProperty (e.g., constructor(private foo: Bar))
    const actualParam =
      param.type === 'TSParameterProperty' ? param.parameter : param;
    const typeAnn =
      actualParam?.typeAnnotation?.typeAnnotation ??
      param?.typeAnnotation?.typeAnnotation;

    // Extract type annotation as token
    if (typeAnn) {
      if (typeAnn.type === 'TSTypeReference' && typeAnn.typeName) {
        token =
          typeAnn.typeName.name ??
          sourceCode.slice(typeAnn.typeName.start, typeAnn.typeName.end);
      } else if (typeAnn.type === 'TSUnionType') {
        for (const t of typeAnn.types || []) {
          if (t.type === 'TSTypeReference' && t.typeName) {
            token =
              t.typeName.name ??
              sourceCode.slice(t.typeName.start, t.typeName.end);
            break;
          }
        }
      }
    }

    // Process parameter decorators (may live on TSParameterProperty or inner param)
    const paramDecs: any[] = [
      ...(param.decorators || []),
      ...(param.type === 'TSParameterProperty' && actualParam?.decorators
        ? actualParam.decorators
        : []),
    ];
    for (const dec of paramDecs) {
      const expr = dec.expression;
      if (!expr || expr.type !== 'CallExpression') continue;
      const decName: string | undefined = expr.callee?.name;
      if (!decName) continue;
      const args: any[] = expr.arguments || [];

      switch (decName) {
        case 'Inject':
          if (args.length > 0) {
            const sv = stringValue(args[0]);
            if (sv !== null) {
              token = sv;
            } else {
              // Unwrap `@Inject(forwardRef(() => TOKEN))` so the
              // emitted token references TOKEN directly. Without this
              // the raw `forwardRef(() => TOKEN)` source slice would
              // appear in the factory output, producing broken code
              // that calls forwardRef at definition time.
              const unwrapped = unwrapForwardRefOxc(args[0]);
              token = sourceCode.slice(unwrapped.start, unwrapped.end);
            }
          }
          break;
        case 'Optional':
          optional = true;
          break;
        case 'Self':
          self = true;
          break;
        case 'SkipSelf':
          skipSelf = true;
          break;
        case 'Host':
          host = true;
          break;
        case 'Attribute':
          if (args.length > 0) {
            const sv = stringValue(args[0]);
            if (sv !== null) {
              attributeNameType = new o.LiteralExpr(sv);
              token = '';
            }
          }
          break;
      }
    }

    if (!token && !attributeNameType) {
      invalid = true;
      continue;
    }

    if (token && typeOnlyImports.has(token)) {
      invalid = true;
      continue;
    }

    deps.push({
      token: token ? new o.WrappedNodeExpr(token) : new o.LiteralExpr(null),
      attributeNameType,
      host,
      optional,
      self,
      skipSelf,
    });
  }

  return invalid ? 'invalid' : deps;
}
