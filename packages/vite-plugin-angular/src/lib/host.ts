import { CompilerHost } from '@angular/compiler-cli';
import { normalizePath } from '@ngtools/webpack/src/ivy/paths';
import type { Root, Text, Element } from 'hast';
import { decl } from 'postcss';
import { transform, visitEachChild } from 'typescript';
import * as ts from 'typescript';
import * as fs from 'fs';
import { loadEsmModule } from './utils/devkit';
import { tsquery, ast } from '@phenomnomnominal/tsquery';
// import { fromHtml } from 'hast-util-from-html';

export async function augmentHostWithResources(
  host: ts.CompilerHost,
  transform: (
    code: string,
    id: string,
    options?: { ssr?: boolean }
  ) => ReturnType<any> | null,
  options: {
    inlineStylesExtension?: string;
  } = {}
) {
  const resourceHost = host as CompilerHost;
  const baseGetSourceFile = (
    resourceHost as ts.CompilerHost
  ).getSourceFile.bind(resourceHost);

  const { fromHtml } = (await loadEsmModule(
    'hast-util-from-html'
  )) as typeof import('hast-util-from-html');
  const { toHtml } = (await loadEsmModule(
    'hast-util-to-html'
  )) as typeof import('hast-util-to-html');

  (resourceHost as ts.CompilerHost).getSourceFile = (
    fileName,
    languageVersionOrOptions,
    onError,
    ...parameters
  ) => {
    if (fileName.includes('.ng')) {
      const source = processNgFile(fileName, fromHtml, toHtml);

      console.log('source', source);

      return ts.createSourceFile(
        fileName,
        source,
        languageVersionOrOptions,
        onError as any,
        ...(parameters as any)
      );
    }

    return baseGetSourceFile.call(
      resourceHost,
      fileName,
      languageVersionOrOptions,
      onError,
      ...parameters
    );
  };

  resourceHost.readResource = function (fileName: string) {
    const filePath = normalizePath(fileName);

    const content = (this as any).readFile(filePath);
    if (content === undefined) {
      throw new Error('Unable to locate component resource: ' + fileName);
    }

    return content;
  };

  resourceHost.transformResource = async function (data, context) {
    // Only style resources are supported currently
    if (context.type !== 'style') {
      return null;
    }

    if (options.inlineStylesExtension) {
      // Resource file only exists for external stylesheets
      const filename =
        context.resourceFile ??
        `${context.containingFile.replace(
          /\.ts$/,
          `.${options?.inlineStylesExtension}`
        )}`;

      let stylesheetResult;

      try {
        stylesheetResult = await transform(data, `${filename}?direct`);
      } catch (e) {
        console.error(`${e}`);
      }

      return { content: stylesheetResult?.code || '' };
    }

    return null;
  };
}

function processNgFile(
  fileName: string,
  fromHtml: typeof import('hast-util-from-html').fromHtml,
  toHtml: typeof import('hast-util-to-html').toHtml
) {
  const contents = fs.readFileSync(fileName.replace('.ng.ts', '.ng'), 'utf-8');

  const ast = fromHtml(contents, { fragment: true, space: 'html' });

  const templateRoot: Root = {
    type: 'root',
    data: ast.data,
    children: [],
  };
  let styles = '';
  let script: Element;

  for (const child of ast.children) {
    if (child.type !== 'element') continue;
    if (child.tagName === 'style') {
      styles = (child.children[0] as Text).value;
      continue;
    }
    if (child.tagName === 'script') {
      script = child;
      continue;
    }
    templateRoot.children.push(child);
  }

  console.log('contents', { fileName, ast });

  const source = `
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: \`${toHtml(templateRoot)}\`,
  styles: \`${styles}\`
})
export default class NgComponent {}
  `;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return processScript(fileName, source, script!);
}

function processScript(fileName: string, source: string, script: Element) {
  const scriptAst = ast((script.children[0] as Text).value);

  const test: any = {
    imports: [],
    metadata: {},
    variables: {},
  };

  transform(scriptAst, [ngScriptTransformer(test)]);

  for (const importNode of test.imports) {
    source = `${importNode}\n${source}`;
  }

  const sourceAst = ast(source, fileName);

  const transformedSource = transform(sourceAst, [sourceTransformer(test)]);
  const updatedSourceText = ts
    .createPrinter()
    .printFile(transformedSource.transformed[0]);
  return updatedSourceText;
}

const sourceTransformer: (
  record: any
) => ts.TransformerFactory<ts.SourceFile> = (record) => (context) => {
  return (sourceFile) => {
    const nodeVisitor = (node: ts.Node) => {
      if (ts.isClassDeclaration(node)) {
        const decorator = node.modifiers![0] as ts.Decorator;
        const decoratorArguments = (decorator.expression as ts.CallExpression)
          .arguments[0] as ts.ObjectLiteralExpression;
        return context.factory.updateClassDeclaration(
          node,
          [
            context.factory.updateDecorator(
              decorator,
              context.factory.createCallExpression(
                context.factory.createIdentifier('Component'),
                undefined,
                [
                  context.factory.updateObjectLiteralExpression(
                    decoratorArguments,
                    [
                      ...decoratorArguments.properties,
                      ...Object.entries(record.metadata).map(
                        ([metadataName, metadataValue]) => {
                          return context.factory.createPropertyAssignment(
                            context.factory.createIdentifier(metadataName),
                            context.factory.createStringLiteral(
                              metadataValue as string
                            )
                          );
                        }
                      ),
                    ]
                  ),
                ]
              )
            ),
            context.factory.createModifier(ts.SyntaxKind.ExportKeyword),
            context.factory.createModifier(ts.SyntaxKind.DefaultKeyword),
          ],
          node.name,
          node.typeParameters,
          node.heritageClauses,
          Object.entries(record.variables).map(([varName, varData]) => {
            return context.factory.createPropertyDeclaration(
              [context.factory.createModifier(ts.SyntaxKind.ProtectedKeyword)],
              varName,
              undefined,
              undefined,
              typeof varData === 'string'
                ? context.factory.createStringLiteral(varData)
                : chauBrute(varData as ts.Expression, context)
            );
          })
        );
      }

      return ts.visitEachChild(node, nodeVisitor, context);
    };

    return ts.visitNode(sourceFile, nodeVisitor) as ts.SourceFile;
  };
};

function chauBrute(
  expression: ts.Expression,
  context: ts.TransformationContext
) {
  if (
    ts.isCallExpression(expression) &&
    expression.expression.getText() === 'signal'
  ) {
    return context.factory.createCallExpression(
      context.factory.createIdentifier('signal'),
      undefined,
      expression.arguments.map((argument) => {
        return context.factory.createNumericLiteral(argument.getText());
      })
    );
  }
  return expression;
}

const ngScriptTransformer: (
  record: any
) => ts.TransformerFactory<ts.SourceFile> = (record) => (context) => {
  return (sourceFile) => {
    const nodeVisitor = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        record['imports'].push(node.getFullText(sourceFile));
        return node;
      }

      if (ts.isVariableStatement(node)) {
        const declaration = node.declarationList.declarations[0];
        if (declaration.name.getText(sourceFile) === 'metadata') {
          (
            declaration.initializer as ts.ObjectLiteralExpression
          ).properties.forEach((property) => {
            record['metadata'][
              (property as ts.PropertyAssignment).name.getText(sourceFile)
            ] = (
              (property as ts.PropertyAssignment)
                .initializer as ts.StringLiteral
            ).text;
          });
          return node;
        }

        const declarationInitializer = declaration.initializer as ts.Expression;
        record['variables'][declaration.name.getText(sourceFile)] =
          ts.isStringLiteral(declarationInitializer)
            ? declarationInitializer.text
            : declarationInitializer;
        return node;
      }

      return ts.visitEachChild(node, nodeVisitor, context);
    };

    return ts.visitNode(sourceFile, nodeVisitor) as ts.SourceFile;
  };
};
