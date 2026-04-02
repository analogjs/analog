import * as ts from 'typescript';
import MagicString from 'magic-string';
import {
  collectTypeOnlyImports,
  findAllClasses,
  ANGULAR_DECORATORS,
} from './utils.js';
import { buildCtorParameters, buildPropDecorators } from './jit-metadata.js';

export interface JitTransformResult {
  code: string;
  map: any;
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
 */
export function jitTransform(
  sourceCode: string,
  fileName: string,
): JitTransformResult {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );
  const ms = new MagicString(sourceCode, { filename: fileName });
  const typeOnlyImports = collectTypeOnlyImports(sourceFile);
  let hasAngularClass = false;

  const allClasses = findAllClasses(sourceFile);

  const postClassStatements: string[] = [];
  let importCounter = 0;
  const resourceImports: string[] = [];
  let needsJitImport = false;

  for (const node of allClasses) {
    const decorators = ts.getDecorators(node);
    if (!decorators) continue;

    const angularDecs = decorators.filter((dec) => {
      if (!ts.isCallExpression(dec.expression)) return false;
      return ANGULAR_DECORATORS.has(
        dec.expression.expression.getText(sourceFile),
      );
    });
    if (angularDecs.length === 0) continue;

    const className = node.name?.text;
    if (!className) continue;
    hasAngularClass = true;

    // 1. Remove Angular decorators from source
    for (const dec of angularDecs) {
      const start = dec.getStart(sourceFile);
      const end = dec.getEnd();
      let trimEnd = end;
      while (trimEnd < sourceCode.length && /\s/.test(sourceCode[trimEnd]))
        trimEnd++;
      ms.remove(start, trimEnd);
    }

    // 2. Emit Class.decorators = [{ type: DecName, args: [...] }]
    //    For @Component: convert templateUrl/styleUrl/styleUrls to ESM imports
    const decoratorMeta: { name: string; argsText: string; entry: string }[] =
      [];
    const decoratorEntries = angularDecs.map((dec) => {
      const call = dec.expression as ts.CallExpression;
      const decName = call.expression.getText(sourceFile);
      const args = call.arguments;

      if (
        args.length > 0 &&
        decName === 'Component' &&
        ts.isObjectLiteralExpression(args[0])
      ) {
        // Rewrite component metadata: convert external resources to imports
        const obj = args[0] as ts.ObjectLiteralExpression;
        const rewrittenProps: string[] = [];

        for (const prop of obj.properties) {
          if (!ts.isPropertyAssignment(prop)) {
            rewrittenProps.push(prop.getText(sourceFile));
            continue;
          }
          const key = prop.name.getText(sourceFile);
          const val = prop.initializer;

          if (
            key === 'templateUrl' &&
            (ts.isStringLiteral(val) || ts.isNoSubstitutionTemplateLiteral(val))
          ) {
            // templateUrl: './foo.html' → template: _tpl0 (with import)
            const varName = `_jit_tpl_${importCounter++}`;
            resourceImports.push(`import ${varName} from '${val.text}?raw';`);
            rewrittenProps.push(`template: ${varName}`);
          } else if (
            key === 'styleUrl' &&
            (ts.isStringLiteral(val) || ts.isNoSubstitutionTemplateLiteral(val))
          ) {
            // styleUrl: './foo.scss' → styles: [_style0]
            const varName = `_jit_style_${importCounter++}`;
            resourceImports.push(
              `import ${varName} from '${val.text}?inline';`,
            );
            rewrittenProps.push(`styles: [${varName}]`);
          } else if (key === 'styleUrls' && ts.isArrayLiteralExpression(val)) {
            // styleUrls: ['./a.scss', './b.css'] → styles: [_style0, _style1]
            const vars: string[] = [];
            for (const el of val.elements) {
              if (
                ts.isStringLiteral(el) ||
                ts.isNoSubstitutionTemplateLiteral(el)
              ) {
                const varName = `_jit_style_${importCounter++}`;
                resourceImports.push(
                  `import ${varName} from '${el.text}?inline';`,
                );
                vars.push(varName);
              }
            }
            rewrittenProps.push(`styles: [${vars.join(', ')}]`);
          } else {
            rewrittenProps.push(prop.getText(sourceFile));
          }
        }
        const rewrittenArgsText = `{${rewrittenProps.join(', ')}}`;
        decoratorMeta.push({
          name: decName,
          argsText: rewrittenArgsText,
          entry: '',
        });
        return `{ type: ${decName}, args: [${rewrittenArgsText}] }`;
      }

      if (args.length > 0) {
        const argsText = args.map((a) => a.getText(sourceFile)).join(', ');
        decoratorMeta.push({ name: decName, argsText, entry: '' });
        return `{ type: ${decName}, args: [${argsText}] }`;
      }
      decoratorMeta.push({ name: decName, argsText: '{}', entry: '' });
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
    const ctorParams = buildCtorParameters(node, sourceFile, typeOnlyImports);
    if (ctorParams) {
      postClassStatements.push(
        `${className}.ctorParameters = () => [${ctorParams}];`,
      );
    }

    // 4. Emit Class.propDecorators for field decorators + signal APIs
    const propDecorators = buildPropDecorators(node, sourceFile);
    if (propDecorators) {
      postClassStatements.push(
        `${className}.propDecorators = ${propDecorators};`,
      );
    }

    // 5. Remove member and parameter decorators from source now that
    //    they have been extracted into static metadata above.
    for (const member of node.members) {
      const memberDecs = ts.getDecorators(member as any);
      if (memberDecs) {
        for (const dec of memberDecs) {
          const start = dec.getStart(sourceFile);
          const end = dec.getEnd();
          let trimEnd = end;
          while (trimEnd < sourceCode.length && /\s/.test(sourceCode[trimEnd]))
            trimEnd++;
          ms.remove(start, trimEnd);
        }
      }
      // Constructor parameter decorators
      if (ts.isConstructorDeclaration(member)) {
        for (const param of member.parameters) {
          const paramDecs = ts.getDecorators(param);
          if (paramDecs) {
            for (const dec of paramDecs) {
              const start = dec.getStart(sourceFile);
              const end = dec.getEnd();
              let trimEnd = end;
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
  }

  if (!hasAngularClass) {
    return { code: sourceCode, map: null };
  }

  // Prepend ESM imports for external templates/styles
  if (resourceImports.length > 0) {
    ms.prepend(resourceImports.join('\n') + '\n');
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
