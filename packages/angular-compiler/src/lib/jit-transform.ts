import { parseSync } from 'oxc-parser';
import MagicString from 'magic-string';
import { detectTypeOnlyImportNames } from './type-elision.js';
import { buildCtorParameters, buildPropDecorators } from './jit-metadata.js';
import { ANGULAR_DECORATORS, FIELD_DECORATORS } from './constants.js';

export interface JitTransformResult {
  code: string;
  map: any;
}

/**
 * Recursively find all ClassDeclaration nodes in an OXC AST.
 * Handles top-level, exported, and nested classes (e.g. inside function scopes).
 */
function findAllClasses(node: any): any[] {
  const result: any[] = [];
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) {
    for (const item of node) {
      result.push(...findAllClasses(item));
    }
    return result;
  }
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    result.push(node);
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
    result.push(...findAllClasses(node[key]));
  }
  return result;
}

/**
 * JIT transform for Angular files.
 *
 * Converts Angular decorators to static metadata arrays that Angular's
 * runtime JIT compiler reads via ReflectionCapabilities:
 *
 * - Class.decorators = [{ type: Component, args: [{...}] }]
 * - Class.ctorParameters = () => [{ type: ServiceA, decorators: [{type: Optional}] }]
 * - Class.propDecorators = { name: [{ type: Input }], ... }
 *
 * Also emits ɵfac (factory function) with constructor DI and downlevels
 * signal APIs (input, model, output, viewChild, etc.) to propDecorators.
 *
 * No template compilation — Angular's JIT compiler handles that at runtime.
 * Requires `import '@angular/compiler'` in main.ts for the browser JIT.
 *
 * Uses OXC's native Rust parser instead of TypeScript's parser for ~1.5x
 * faster parsing and source-position slicing instead of getText() calls.
 */
export function jitTransform(
  sourceCode: string,
  fileName: string,
): JitTransformResult {
  const { program } = parseSync(fileName, sourceCode);
  const ms = new MagicString(sourceCode, { filename: fileName });
  const typeOnlyImports = detectTypeOnlyImportNames(sourceCode);
  let hasAngularClass = false;

  const allClasses = findAllClasses(program.body);

  const postClassStatements: string[] = [];
  let importCounter = 0;
  const resourceImports: string[] = [];
  let needsJitImport = false;

  for (const node of allClasses) {
    const decorators: any[] = node.decorators || [];

    const angularDecs = decorators.filter((dec: any) => {
      const expr = dec.expression;
      if (!expr || expr.type !== 'CallExpression') return false;
      const name: string | undefined = expr.callee?.name;
      // Keep @Injectable on the class — Angular's decorator function
      // self-registers ɵprov (providedIn) at class definition time and
      // there is no ɵcompileInjectable JIT entry point to call instead.
      if (name === 'Injectable') return false;
      return name !== undefined && ANGULAR_DECORATORS.has(name);
    });
    if (angularDecs.length === 0) continue;

    const className: string | undefined = node.id?.name;
    if (!className) continue;
    hasAngularClass = true;

    // 1. Remove Angular decorators from source
    for (const dec of angularDecs) {
      const start: number = dec.start;
      let trimEnd: number = dec.end;
      while (trimEnd < sourceCode.length && /\s/.test(sourceCode[trimEnd]))
        trimEnd++;
      ms.remove(start, trimEnd);
    }

    // 2. Emit Class.decorators = [{ type: DecName, args: [...] }]
    //    For @Component: convert templateUrl/styleUrl/styleUrls to ESM imports
    const decoratorMeta: { name: string; argsText: string }[] = [];
    const decoratorEntries = angularDecs.map((dec: any) => {
      const call = dec.expression;
      const decName: string = call.callee.name;
      const args: any[] = call.arguments || [];

      if (
        args.length > 0 &&
        decName === 'Component' &&
        args[0].type === 'ObjectExpression'
      ) {
        // Rewrite component metadata: convert external resources to imports
        const obj = args[0];
        const rewrittenProps: string[] = [];

        for (const prop of obj.properties) {
          if (prop.type !== 'ObjectProperty' && prop.type !== 'Property') {
            rewrittenProps.push(sourceCode.slice(prop.start, prop.end));
            continue;
          }
          const key: string = prop.key?.name || prop.key?.value;
          const val = prop.value;

          if (
            key === 'templateUrl' &&
            (val?.type === 'StringLiteral' ||
              (val?.type === 'Literal' && typeof val.value === 'string'))
          ) {
            // templateUrl: './foo.html' → template: _tpl0 (with import)
            const varName = `_jit_tpl_${importCounter++}`;
            resourceImports.push(`import ${varName} from '${val.value}?raw';`);
            rewrittenProps.push(`template: ${varName}`);
          } else if (
            key === 'styleUrl' &&
            (val?.type === 'StringLiteral' ||
              (val?.type === 'Literal' && typeof val.value === 'string'))
          ) {
            // styleUrl: './foo.scss' → styles: [_style0]
            const varName = `_jit_style_${importCounter++}`;
            resourceImports.push(
              `import ${varName} from '${val.value}?inline';`,
            );
            rewrittenProps.push(`styles: [${varName}]`);
          } else if (key === 'styleUrls' && val?.type === 'ArrayExpression') {
            // styleUrls: ['./a.scss', './b.css'] → styles: [_style0, _style1]
            const vars: string[] = [];
            for (const el of val.elements) {
              if (
                el?.type === 'StringLiteral' ||
                (el?.type === 'Literal' && typeof el.value === 'string')
              ) {
                const varName = `_jit_style_${importCounter++}`;
                resourceImports.push(
                  `import ${varName} from '${el.value}?inline';`,
                );
                vars.push(varName);
              }
            }
            rewrittenProps.push(`styles: [${vars.join(', ')}]`);
          } else {
            rewrittenProps.push(sourceCode.slice(prop.start, prop.end));
          }
        }
        const rewrittenArgsText = `{${rewrittenProps.join(', ')}}`;
        decoratorMeta.push({ name: decName, argsText: rewrittenArgsText });
        return `{ type: ${decName}, args: [${rewrittenArgsText}] }`;
      }

      if (args.length > 0) {
        const argsText = args
          .map((a: any) => sourceCode.slice(a.start, a.end))
          .join(', ');
        decoratorMeta.push({ name: decName, argsText });
        return `{ type: ${decName}, args: [${argsText}] }`;
      }
      decoratorMeta.push({ name: decName, argsText: '{}' });
      return `{ type: ${decName} }`;
    });
    postClassStatements.push(
      `${className}.decorators = [${decoratorEntries.join(', ')}];`,
    );

    // 2b. Trigger JIT compilation with the rewritten decorator metadata
    for (const dm of decoratorMeta) {
      needsJitImport = true;
      switch (dm.name) {
        case 'Component':
          postClassStatements.push(
            `_jitCompileComponent(${className}, ${dm.argsText});`,
          );
          break;
        case 'Directive':
          postClassStatements.push(
            `_jitCompileDirective(${className}, ${dm.argsText});`,
          );
          break;
        case 'Pipe':
          postClassStatements.push(
            `_jitCompilePipe(${className}, ${dm.argsText});`,
          );
          break;
        case 'NgModule':
          postClassStatements.push(
            `_jitCompileNgModule(${className}, ${dm.argsText});`,
          );
          break;
      }
    }

    // 3. Emit Class.ctorParameters for constructor DI
    const ctorParams = buildCtorParameters(node, sourceCode, typeOnlyImports);
    if (ctorParams) {
      postClassStatements.push(
        `${className}.ctorParameters = () => [${ctorParams}];`,
      );
    }

    // 4. Emit Class.propDecorators for field decorators + signal APIs
    const propDecorators = buildPropDecorators(node, sourceCode);
    if (propDecorators) {
      postClassStatements.push(
        `${className}.propDecorators = ${propDecorators};`,
      );
    }

    // 5. Remove member and parameter decorators from source now that
    //    they have been extracted into static metadata above.
    const members: any[] = node.body?.body || [];
    for (const member of members) {
      const memberDecs: any[] = member.decorators || [];
      for (const dec of memberDecs) {
        const start: number = dec.start;
        let trimEnd: number = dec.end;
        while (trimEnd < sourceCode.length && /\s/.test(sourceCode[trimEnd]))
          trimEnd++;
        ms.remove(start, trimEnd);
      }
      // Constructor parameter decorators
      if (member.type === 'MethodDefinition' && member.kind === 'constructor') {
        const params: any[] =
          member.value?.params?.items || member.value?.params || [];
        for (const param of params) {
          // Decorators may live on the TSParameterProperty wrapper or the inner param
          const allParamDecs: any[] = [
            ...(param.decorators || []),
            ...(param.type === 'TSParameterProperty' &&
            param.parameter?.decorators
              ? param.parameter.decorators
              : []),
          ];
          for (const dec of allParamDecs) {
            const start: number = dec.start;
            let trimEnd: number = dec.end;
            while (
              trimEnd < sourceCode.length &&
              /\s/.test(sourceCode[trimEnd])
            )
              trimEnd++;
            ms.remove(start, trimEnd);
          }
        }
      }
    }
  }

  if (!hasAngularClass) {
    return { code: sourceCode, map: null };
  }

  // Prepend ESM imports for external templates/styles
  if (resourceImports.length > 0) {
    ms.prepend(resourceImports.join('\n') + '\n');
  }

  // Prepend imports for decorator classes referenced by signal API downleveling
  // (e.g. input() → {type: Input}, model() → {type: Input} + {type: Output})
  const existingImports = new Set<string>();
  for (const stmt of program.body) {
    if (
      (stmt as any).type === 'ImportDeclaration' &&
      (stmt as any).source?.value === '@angular/core'
    ) {
      for (const spec of (stmt as any).specifiers || []) {
        if (spec.type === 'ImportSpecifier') {
          existingImports.add(spec.local?.name || spec.imported?.name);
        }
      }
    }
  }
  const allPostCode = postClassStatements.join('\n');
  const missingDecorators: string[] = [];
  for (const dec of FIELD_DECORATORS) {
    if (allPostCode.includes(`type: ${dec}`) && !existingImports.has(dec)) {
      missingDecorators.push(dec);
    }
  }
  if (missingDecorators.length > 0) {
    ms.prepend(
      `import { ${missingDecorators.join(', ')} } from '@angular/core';\n`,
    );
  }

  // Prepend JIT compiler imports
  if (needsJitImport) {
    ms.prepend(
      `import { ɵcompileComponent as _jitCompileComponent, ɵcompileDirective as _jitCompileDirective, ɵcompilePipe as _jitCompilePipe, ɵcompileNgModule as _jitCompileNgModule } from '@angular/core';\n`,
    );
  }

  // Append all post-class statements at the end
  if (postClassStatements.length > 0) {
    ms.append('\n' + postClassStatements.join('\n') + '\n');
  }

  const map = ms.generateMap({
    source: fileName,
    file: fileName + '.js',
    includeContent: true,
    hires: 'boundary',
  });

  return { code: ms.toString(), map };
}
