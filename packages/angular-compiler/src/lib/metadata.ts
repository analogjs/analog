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

/** Extract the string value from an OXC string literal or template literal node. */
function stringValue(node: any): string | null {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  if (node?.type === 'TemplateLiteral' && !node.expressions?.length)
    return node.quasis?.[0]?.value?.cooked ?? null;
  return null;
}

/** Check if an OXC node is a string-like literal. */
function isStringLike(node: any): boolean {
  return stringValue(node) !== null;
}

/** Get the property key name from an OXC object property. */
function propKeyName(prop: any): string | null {
  if (!prop.key) return null;
  return prop.key.name ?? prop.key.value ?? null;
}

/**
 * Extract decorator metadata from an OXC decorator AST node.
 * Parses @Component, @Directive, @Pipe, @Injectable, @NgModule arguments.
 */
export function extractMetadata(dec: any | undefined, sourceCode: string): any {
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
            const hVal = sourceCode
              .slice(hp.value.start, hp.value.end)
              .replace(/['"`]/g, '');
            meta.hostRaw[hKey.replace(/['"`]/g, '')] = hVal;
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
        const sv = stringValue(valNode);
        meta[key] = sv !== null ? sv : valText.replace(/['"`]/g, '');
        if (key === 'exportAs') meta.exportAs = [meta.exportAs];
        break;
      }
      case 'styleUrl': {
        const sv = stringValue(valNode);
        meta.styleUrls = [sv !== null ? sv : valText.replace(/['"`]/g, '')];
        break;
      }
      case 'styleUrls':
        if (valNode.type === 'ArrayExpression') {
          meta.styleUrls = (valNode.elements || []).map((e: any) => {
            const sv = stringValue(e);
            return sv !== null
              ? sv
              : sourceCode.slice(e.start, e.end).replace(/['"`]/g, '');
          });
        }
        break;
      case 'styles':
        if (valNode.type === 'ArrayExpression') {
          meta.styles = (valNode.elements || []).map((e: any) => {
            const sv = stringValue(e);
            return sv !== null
              ? sv
              : sourceCode.slice(e.start, e.end).replace(/['"`]/g, '');
          });
        } else {
          const sv = stringValue(valNode);
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
      const optionsArg = required ? args[0] : args[1];
      if (optionsArg?.type === 'ObjectExpression') {
        for (const prop of optionsArg.properties || []) {
          if (
            (prop.type === 'ObjectProperty' || prop.type === 'Property') &&
            propKeyName(prop) === 'transform'
          ) {
            transform = new o.WrappedNodeExpr(prop.value);
          }
        }
      }
      inputs[name] = {
        classPropertyName: name,
        bindingPropertyName: name,
        isSignal: true,
        required,
        transform,
      };
    }

    // 2. MODEL SIGNALS (Writable Inputs)
    else if (api === 'model') {
      inputs[name] = {
        classPropertyName: name,
        bindingPropertyName: name,
        isSignal: true,
      };
      outputs[name + 'Change'] = name + 'Change';
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

      const query = {
        propertyName: name,
        predicate: sv !== null ? [sv] : new o.WrappedNodeExpr(firstArg),
        first: !isChildrenQuery,
        descendants: true,
        read: null,
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

          let predicate: any = memberName;
          if (args.length > 0) {
            const pred = args[0];
            const sv = stringValue(pred);
            if (sv !== null) {
              predicate = [sv];
            } else {
              predicate = new o.WrappedNodeExpr(unwrapForwardRefOxc(pred));
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
              token = sourceCode.slice(args[0].start, args[0].end);
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
