import * as ts from 'typescript';

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
      const callExpr = member.initializer.expression.getText(sf);
      const args = member.initializer.arguments;

      if (callExpr.includes('input')) {
        if (!props[memberName]) props[memberName] = [];
        const isRequired = callExpr.includes('.required');
        // Extract alias from options
        let alias: string | null = null;
        const optArg = isRequired ? args[0] : args[1];
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
            `{alias: '${alias}', isSignal: true, required: ${isRequired}}`,
          );
        else inputArgs.push(`{isSignal: true, required: ${isRequired}}`);
        props[memberName].push(
          `{type: Input, args: [${inputArgs.join(', ')}]}`,
        );
      } else if (callExpr.includes('model')) {
        if (!props[memberName]) props[memberName] = [];
        props[memberName].push(`{type: Input, args: [{isSignal: true}]}`);
        // Model also generates a Change output
        const changeName = memberName + 'Change';
        if (!props[changeName]) props[changeName] = [];
        props[changeName].push(`{type: Output, args: ['${changeName}']}`);
      } else if (
        callExpr.includes('output') ||
        callExpr.includes('outputFromObservable')
      ) {
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
      } else if (
        callExpr.includes('viewChild') ||
        callExpr.includes('viewChildren')
      ) {
        if (!props[memberName]) props[memberName] = [];
        const queryType = callExpr.includes('Children')
          ? 'ViewChildren'
          : 'ViewChild';
        if (args.length > 0) {
          props[memberName].push(
            `{type: ${queryType}, args: [${args[0].getText(sf)}]}`,
          );
        } else {
          props[memberName].push(`{type: ${queryType}}`);
        }
      } else if (
        callExpr.includes('contentChild') ||
        callExpr.includes('contentChildren')
      ) {
        if (!props[memberName]) props[memberName] = [];
        const queryType = callExpr.includes('Children')
          ? 'ContentChildren'
          : 'ContentChild';
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
