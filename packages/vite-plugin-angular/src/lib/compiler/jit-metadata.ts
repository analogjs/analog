/**
 * JIT metadata helpers — OXC AST edition.
 *
 * Builds static metadata arrays that Angular's ReflectionCapabilities reads
 * at runtime for JIT compilation (ctorParameters, propDecorators).
 *
 * Uses source-position slicing instead of AST getText() for speed.
 */
import { FIELD_DECORATORS } from './constants.js';

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
 * Read a string-literal `alias` value out of an OXC ObjectExpression.
 * Returns null when the arg isn't an object literal, has no alias, or
 * the alias value isn't a static string. Shorthand `{alias}` is skipped
 * because the identifier wouldn't be in scope when the propDecorators
 * static block is evaluated at class top level.
 */
function extractAlias(optArg: any): string | null {
  if (!optArg || optArg.type !== 'ObjectExpression') return null;
  for (const p of optArg.properties || []) {
    if (p.type !== 'ObjectProperty' && p.type !== 'Property') continue;
    if (p.shorthand) continue;
    const pKey = p.key?.name || p.key?.value;
    if (pKey !== 'alias') continue;
    const v = p.value;
    if (v?.type === 'StringLiteral') return v.value;
    if (v?.type === 'Literal' && typeof v.value === 'string') return v.value;
  }
  return null;
}

function escapeStringLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Build ctorParameters for constructor DI in JIT format:
 * [{ type: ServiceA }, { type: ServiceB, decorators: [{type: Optional}] }]
 *
 * Accepts an OXC ClassDeclaration node and the original source string.
 */
export function buildCtorParameters(
  classNode: any,
  sourceCode: string,
  typeOnlyImports: Set<string>,
): string | null {
  const members: any[] = classNode.body?.body || [];
  const ctor = members.find(
    (m: any) => m.type === 'MethodDefinition' && m.kind === 'constructor',
  );
  if (!ctor) return null;

  const params: any[] = ctor.value?.params?.items || ctor.value?.params || [];
  if (params.length === 0) return null;

  const result: string[] = [];
  for (const param of params) {
    const parts: string[] = [];

    // Handle TSParameterProperty (e.g., constructor(private foo: Bar))
    const actualParam =
      param.type === 'TSParameterProperty' ? param.parameter : param;
    const typeAnn =
      actualParam?.typeAnnotation?.typeAnnotation ??
      param?.typeAnnotation?.typeAnnotation;

    // Extract type name from annotation
    let typeName: string | null = null;
    if (typeAnn) {
      if (typeAnn.type === 'TSTypeReference' && typeAnn.typeName) {
        typeName =
          typeAnn.typeName.name ??
          sourceCode.slice(typeAnn.typeName.start, typeAnn.typeName.end);
      } else if (typeAnn.type === 'TSUnionType') {
        for (const t of typeAnn.types || []) {
          if (t.type === 'TSTypeReference' && t.typeName) {
            typeName =
              t.typeName.name ??
              sourceCode.slice(t.typeName.start, t.typeName.end);
            break;
          }
        }
      }
    }

    if (typeName && !typeOnlyImports.has(typeName)) {
      parts.push(`type: ${typeName}`);
    } else {
      parts.push(`type: undefined`);
    }

    // Extract parameter decorators (may live on TSParameterProperty or the param itself)
    const paramDecs: any[] = param.decorators || actualParam?.decorators || [];
    if (paramDecs.length > 0) {
      const decEntries = paramDecs
        .map((dec: any) => {
          const expr = dec.expression;
          if (!expr || expr.type !== 'CallExpression') return '';
          const name = expr.callee?.name;
          if (!name) return '';
          const args: any[] = expr.arguments || [];
          if (args.length > 0) {
            return `{type: ${name}, args: [${args.map((a: any) => sourceCode.slice(a.start, a.end)).join(', ')}]}`;
          }
          return `{type: ${name}}`;
        })
        .filter(Boolean);
      if (decEntries.length > 0) {
        parts.push(`decorators: [${decEntries.join(', ')}]`);
      }
    }

    result.push(`{${parts.join(', ')}}`);
  }

  return result.join(', ');
}

/**
 * Build propDecorators for field decorators + signal API downleveling.
 * Returns a JS object literal string or null if no props.
 *
 * Accepts an OXC ClassDeclaration node and the original source string.
 */
export function buildPropDecorators(
  classNode: any,
  sourceCode: string,
): string | null {
  const props: Record<string, string[]> = {};
  const members: any[] = classNode.body?.body || [];

  for (const member of members) {
    const memberName: string | undefined = member.key?.name;
    if (!memberName) continue;

    // Check for field decorators (@Input, @Output, @ViewChild, etc.)
    const decorators: any[] = member.decorators || [];
    for (const dec of decorators) {
      const expr = dec.expression;
      if (!expr || expr.type !== 'CallExpression') continue;
      const decName: string | undefined = expr.callee?.name;
      if (!decName || !FIELD_DECORATORS.has(decName)) continue;

      if (!props[memberName]) props[memberName] = [];
      const args: any[] = expr.arguments || [];
      if (args.length > 0) {
        props[memberName].push(
          `{type: ${decName}, args: [${args.map((a: any) => sourceCode.slice(a.start, a.end)).join(', ')}]}`,
        );
      } else {
        props[memberName].push(`{type: ${decName}}`);
      }
    }

    // Signal API downleveling
    if (
      member.type === 'PropertyDefinition' &&
      member.value?.type === 'CallExpression'
    ) {
      const signalCall = getCallApi(member.value);
      if (!signalCall) continue;

      const { api, required } = signalCall;
      const args: any[] = member.value.arguments || [];

      if (api === 'input') {
        if (!props[memberName]) props[memberName] = [];
        // Preserve all original options from the input() call and overlay isSignal/required
        const optArg = required ? args[0] : args[1];
        const optParts: string[] = [];
        if (optArg?.type === 'ObjectExpression') {
          for (const p of optArg.properties || []) {
            if (p.type !== 'ObjectProperty' && p.type !== 'Property') continue;
            const pKey = p.key?.name || p.key?.value;
            // Skip isSignal/required — we override them below
            if (pKey === 'isSignal' || pKey === 'required') continue;
            optParts.push(sourceCode.slice(p.start, p.end));
          }
        }
        optParts.push(`isSignal: true`, `required: ${required}`);
        props[memberName].push(
          `{type: Input, args: [{${optParts.join(', ')}}]}`,
        );
      } else if (api === 'model') {
        // Both Input and Output must live on the SAME propDecorators key
        // (the class field name). Angular's JIT facade indexes outputs by
        // classPropertyName and reads `instance[classPropertyName]` for
        // the EventEmitter — for a model that's the signal itself, which
        // exposes the emitter via [SIGNAL]. Splitting Output onto a
        // synthetic `<name>Change` key would point at a field that does
        // not exist on the class, breaking two-way bindings.
        if (!props[memberName]) props[memberName] = [];
        const optArg = required ? args[0] : args[1];
        const alias = extractAlias(optArg);
        const bindingName = alias ?? memberName;
        props[memberName].push(
          `{type: Input, args: [{isSignal: true, alias: '${escapeStringLiteral(bindingName)}', required: ${required}}]}`,
        );
        props[memberName].push(
          `{type: Output, args: ['${escapeStringLiteral(bindingName + 'Change')}']}`,
        );
      } else if (api === 'output' || api === 'outputFromObservable') {
        if (!props[memberName]) props[memberName] = [];
        // Extract alias
        let alias: string | null = null;
        const optArg = args[0];
        if (optArg?.type === 'ObjectExpression') {
          for (const p of optArg.properties || []) {
            if (
              (p.type === 'ObjectProperty' || p.type === 'Property') &&
              (p.key?.name || p.key?.value) === 'alias'
            ) {
              if (
                p.value?.type === 'StringLiteral' ||
                (p.value?.type === 'Literal' &&
                  typeof p.value.value === 'string')
              ) {
                alias = p.value.value;
              }
            }
          }
        }
        if (alias) {
          props[memberName].push(`{type: Output, args: ['${alias}']}`);
        } else {
          props[memberName].push(`{type: Output}`);
        }
      } else if (
        api === 'viewChild' ||
        api === 'viewChildren' ||
        api === 'contentChild' ||
        api === 'contentChildren'
      ) {
        if (!props[memberName]) props[memberName] = [];
        const queryType =
          api === 'viewChildren'
            ? 'ViewChildren'
            : api === 'viewChild'
              ? 'ViewChild'
              : api === 'contentChildren'
                ? 'ContentChildren'
                : 'ContentChild';
        // Signal queries need `isSignal: true` so the runtime JIT compiler
        // wires them through the signal query infrastructure rather than
        // treating them as plain @ViewChild/@ContentChild assignments.
        // Mirrors Angular's own JIT transform in
        // compiler-cli/.../initializer_api_transforms/query_functions.ts.
        if (args.length > 0) {
          const opts =
            args.length > 1
              ? `{...${sourceCode.slice(args[1].start, args[1].end)}, isSignal: true}`
              : `{isSignal: true}`;
          props[memberName].push(
            `{type: ${queryType}, args: [${sourceCode.slice(args[0].start, args[0].end)}, ${opts}]}`,
          );
        } else {
          props[memberName].push(
            `{type: ${queryType}, args: [undefined, {isSignal: true}]}`,
          );
        }
      }
    }
  }

  const entries = Object.entries(props);
  if (entries.length === 0) return null;

  const propsStr = entries
    .map(([key, decs]) => `${key}: [${decs.join(', ')}]`)
    .join(', ');
  return `{${propsStr}}`;
}
