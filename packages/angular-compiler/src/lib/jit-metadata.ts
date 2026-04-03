import * as ts from 'typescript';

function getCallApi(
  call: ts.CallExpression,
): { api: string; required: boolean } | null {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) {
    return { api: expr.text, required: false };
  }

  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.name.text === 'required'
  ) {
    return { api: expr.expression.text, required: true };
  }

  return null;
}

/**
 * Build ctorParameters for constructor DI in JIT format:
 * [{ type: ServiceA }, { type: ServiceB, decorators: [{type: Optional}] }]
 */
export function buildCtorParameters(
  node: ts.ClassDeclaration,
  sf: ts.SourceFile,
  typeOnlyImports: Set<string>,
): string | null {
  const ctor = node.members.find(ts.isConstructorDeclaration) as
    | ts.ConstructorDeclaration
    | undefined;
  if (!ctor || ctor.parameters.length === 0) return null;

  const params: string[] = [];
  for (const param of ctor.parameters) {
    const parts: string[] = [];

    // Extract type
    let typeName: string | null = null;
    if (param.type && ts.isTypeReferenceNode(param.type)) {
      typeName = param.type.typeName.getText(sf);
    } else if (param.type && ts.isUnionTypeNode(param.type)) {
      for (const t of param.type.types) {
        if (ts.isTypeReferenceNode(t)) {
          typeName = t.typeName.getText(sf);
          break;
        }
      }
    }

    if (typeName && !typeOnlyImports.has(typeName)) {
      parts.push(`type: ${typeName}`);
    } else {
      parts.push(`type: undefined`);
    }

    // Extract parameter decorators
    const paramDecs = ts.getDecorators(param);
    if (paramDecs && paramDecs.length > 0) {
      const decEntries = paramDecs
        .map((dec) => {
          if (!ts.isCallExpression(dec.expression)) return '';
          const name = dec.expression.expression.getText(sf);
          const args = dec.expression.arguments;
          if (args.length > 0) {
            return `{type: ${name}, args: [${args.map((a) => a.getText(sf)).join(', ')}]}`;
          }
          return `{type: ${name}}`;
        })
        .filter(Boolean);
      if (decEntries.length > 0) {
        parts.push(`decorators: [${decEntries.join(', ')}]`);
      }
    }

    params.push(`{${parts.join(', ')}}`);
  }

  return params.join(', ');
}

/**
 * Build propDecorators for field decorators + signal API downleveling.
 * Returns a JS object literal string or null if no props.
 */
export function buildPropDecorators(
  node: ts.ClassDeclaration,
  sf: ts.SourceFile,
): string | null {
  const props: Record<string, string[]> = {};

  for (const member of node.members) {
    const memberName = member.name?.getText(sf);
    if (!memberName) continue;

    // Check for field decorators (@Input, @Output, @ViewChild, etc.)
    const decorators = ts.getDecorators(member as any);
    if (decorators) {
      for (const dec of decorators) {
        if (!ts.isCallExpression(dec.expression)) continue;
        const decName = dec.expression.expression.getText(sf);
        if (
          [
            'Input',
            'Output',
            'ViewChild',
            'ViewChildren',
            'ContentChild',
            'ContentChildren',
            'HostBinding',
            'HostListener',
          ].includes(decName)
        ) {
          if (!props[memberName]) props[memberName] = [];
          const args = dec.expression.arguments;
          if (args.length > 0) {
            props[memberName].push(
              `{type: ${decName}, args: [${args.map((a) => a.getText(sf)).join(', ')}]}`,
            );
          } else {
            props[memberName].push(`{type: ${decName}}`);
          }
        }
      }
    }

    // Signal API downleveling
    if (
      ts.isPropertyDeclaration(member) &&
      member.initializer &&
      ts.isCallExpression(member.initializer)
    ) {
      const signalCall = getCallApi(member.initializer);
      if (!signalCall) continue;

      const { api, required } = signalCall;
      const args = member.initializer.arguments;

      if (api === 'input') {
        if (!props[memberName]) props[memberName] = [];
        // Extract alias from options
        let alias: string | null = null;
        const optArg = required ? args[0] : args[1];
        if (optArg && ts.isObjectLiteralExpression(optArg)) {
          for (const p of optArg.properties) {
            if (
              ts.isPropertyAssignment(p) &&
              p.name.getText(sf) === 'alias' &&
              ts.isStringLiteral(p.initializer)
            ) {
              alias = p.initializer.text;
            }
          }
        }
        const inputArgs: string[] = [];
        if (alias)
          inputArgs.push(
            `{alias: '${alias}', isSignal: true, required: ${required}}`,
          );
        else inputArgs.push(`{isSignal: true, required: ${required}}`);
        props[memberName].push(
          `{type: Input, args: [${inputArgs.join(', ')}]}`,
        );
      } else if (api === 'model') {
        if (!props[memberName]) props[memberName] = [];
        props[memberName].push(`{type: Input, args: [{isSignal: true}]}`);
        // Model also generates a Change output
        const changeName = memberName + 'Change';
        if (!props[changeName]) props[changeName] = [];
        props[changeName].push(`{type: Output, args: ['${changeName}']}`);
      } else if (api === 'output' || api === 'outputFromObservable') {
        if (!props[memberName]) props[memberName] = [];
        // Extract alias
        let alias: string | null = null;
        const optArg = args[0];
        if (optArg && ts.isObjectLiteralExpression(optArg)) {
          for (const p of optArg.properties) {
            if (
              ts.isPropertyAssignment(p) &&
              p.name.getText(sf) === 'alias' &&
              ts.isStringLiteral(p.initializer)
            ) {
              alias = p.initializer.text;
            }
          }
        }
        if (alias) {
          props[memberName].push(`{type: Output, args: ['${alias}']}`);
        } else {
          props[memberName].push(`{type: Output}`);
        }
      } else if (api === 'viewChild' || api === 'viewChildren') {
        if (!props[memberName]) props[memberName] = [];
        const queryType = api === 'viewChildren' ? 'ViewChildren' : 'ViewChild';
        if (args.length > 0) {
          props[memberName].push(
            `{type: ${queryType}, args: [${args[0].getText(sf)}]}`,
          );
        } else {
          props[memberName].push(`{type: ${queryType}}`);
        }
      } else if (api === 'contentChild' || api === 'contentChildren') {
        if (!props[memberName]) props[memberName] = [];
        const queryType =
          api === 'contentChildren' ? 'ContentChildren' : 'ContentChild';
        if (args.length > 0) {
          props[memberName].push(
            `{type: ${queryType}, args: [${args[0].getText(sf)}]}`,
          );
        } else {
          props[memberName].push(`{type: ${queryType}}`);
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
