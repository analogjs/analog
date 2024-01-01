import { CompilerHost } from '@angular/compiler-cli';
import { normalizePath } from '@ngtools/webpack/src/ivy/paths';
import * as fs from 'fs';
import {
  Node,
  ObjectLiteralExpression,
  Project,
  Scope,
  StructureKind,
} from 'ts-morph';
import * as ts from 'typescript';

export function augmentHostWithResources(
  host: ts.CompilerHost,
  transform: (
    code: string,
    id: string,
    options?: { ssr?: boolean }
  ) => ReturnType<any> | null,
  options: {
    inlineStylesExtension?: string;
    supportNgFormat?: boolean;
    isProd?: boolean;
  } = {}
) {
  const resourceHost = host as CompilerHost;
  const baseGetSourceFile = (
    resourceHost as ts.CompilerHost
  ).getSourceFile.bind(resourceHost);

  if (options.supportNgFormat) {
    (resourceHost as ts.CompilerHost).getSourceFile = (
      fileName,
      languageVersionOrOptions,
      onError,
      ...parameters
    ) => {
      if (fileName.includes('.ng')) {
        const source = processNgFile(fileName, options.isProd);

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
  }

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

function processNgFile(fileName: string, isProd?: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { names } = require('@nx/devkit');

  const componentName = fileName.split('/').pop()?.split('.')[0];
  if (!componentName) {
    throw new Error(`[Analog] Missing component name ${fileName}`);
  }

  const {
    fileName: componentFileName,
    className,
    constantName,
  } = names(componentName);
  const componentDefaultSelectors = [
    componentFileName,
    className,
    constantName,
  ];

  const project = new Project();
  const contents = fs.readFileSync(fileName.replace('.ng.ts', '.ng'), 'utf-8');

  const scriptRegex = /<script lang="ts">([\s\S]*?)<\/script>/i;
  const templateRegex = /<template>([\s\S]*?)<\/template>/i;
  const styleRegex = /<style>([\s\S]*?)<\/style>/i;

  // eslint-disable-next-line prefer-const
  let [scriptContent, templateContent, styleContent] = [
    scriptRegex.exec(contents)?.pop()?.trim() || '',
    templateRegex.exec(contents)?.pop()?.trim() || '',
    styleRegex.exec(contents)?.pop()?.trim() || '',
  ];

  // the `.ng` file
  if (scriptContent) {
    project.createSourceFile(fileName, scriptContent, {
      overwrite: true,
      scriptKind: ts.ScriptKind.TS,
    });
  }

  if (styleContent) {
    templateContent = `<style>${styleContent.replace(/\n/g, '')}</style>
${templateContent}`;
  }

  const source = `
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  standalone: true,
  selector: '${componentDefaultSelectors.join(', ')}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: \`${templateContent}\`
})
export default class NgComponent {
  constructor() {}
}`;

  if (scriptContent) {
    project.createSourceFile(`${fileName}.virtual.ts`, source, {
      scriptKind: ts.ScriptKind.TS,
    });

    return processNgScript(fileName, project, isProd);
  }

  return source;
}

function processNgScript(fileName: string, project: Project, isProd?: boolean) {
  const ngSourceFile = project.getSourceFile(fileName);
  const targetSourceFile = project.getSourceFile(`${fileName}.virtual.ts`);

  if (!ngSourceFile || !targetSourceFile) {
    throw new Error(`[Analog] Missing source files ${fileName}`);
  }

  const targetClass = targetSourceFile.getClass(
    (classDeclaration) => classDeclaration.getName() === 'NgComponent'
  );

  if (!targetClass) {
    throw new Error(`[Analog] Missing component class ${fileName}`);
  }

  const targetMetadata = targetClass.getDecorator('Component');

  if (!targetMetadata) {
    throw new Error(`[Analog] Missing component metadata ${fileName}`);
  }

  let targetMetadataArguments =
    targetMetadata.getArguments()[0] as ObjectLiteralExpression;

  if (!Node.isObjectLiteralExpression(targetMetadataArguments)) {
    throw new Error(
      `[Analog] Missing component metadata arguments ${fileName}`
    );
  }

  const targetConstructor = targetClass.getConstructors()[0];
  const targetConstructorBody = targetConstructor.getBody();

  if (!Node.isBlock(targetConstructorBody)) {
    throw new Error(`[Analog] Missing component constructor body ${fileName}`);
  }

  const declarations: string[] = [];

  ngSourceFile.forEachChild((node) => {
    if (Node.isImportDeclaration(node)) {
      const moduleSpecifier = node.getModuleSpecifierValue();
      if (moduleSpecifier.endsWith('.ng')) {
        // other .ng files
        declarations.push(node.getDefaultImport()?.getText() || '');
      }

      targetSourceFile.addImportDeclaration({
        moduleSpecifier: moduleSpecifier,
        namedImports: node.getNamedImports().map((namedImport) => {
          return {
            name: namedImport.getName(),
            alias: namedImport.getAliasNode()?.getText(),
          };
        }),
        defaultImport: node.getDefaultImport()?.getText(),
      });
    }

    if (Node.isVariableStatement(node)) {
      const declarations = node.getDeclarations();
      const declaration = declarations[0];

      const initializer = declaration.getInitializer();

      if (initializer) {
        // add the property to the class
        targetClass.addProperty({
          name: declaration.getName(),
          kind: StructureKind.Property,
          scope: Scope.Protected,
        });

        // add the variable initializer to the constructor
        targetConstructor.addVariableStatement({
          declarations: [
            {
              name: declaration.getName(),
              initializer: initializer.getText(),
              type: declaration.getTypeNode()?.getText(),
            },
          ],
        });

        // assign the variable to the property
        targetConstructor.addStatements(
          Node.isArrowFunction(initializer)
            ? `this.${declaration.getName()} = ${declaration.getName()}.bind(this);`
            : `this.${declaration.getName()} = ${declaration.getName()};`
        );
      }
    }

    if (Node.isFunctionDeclaration(node)) {
      // add the property to the class
      targetClass.addProperty({
        name: node.getName() || '',
        kind: StructureKind.Property,
        scope: Scope.Protected,
      });

      // add the variable initializer to the constructor
      targetConstructor.addFunction({
        name: node.getName() || '',
        parameters: node
          .getParameters()
          .map((parameter) => parameter.getStructure()),
        statements: node
          .getStatements()
          .map((statement) => statement.getText()),
      });

      // assign the variable to the property
      targetConstructor.addStatements(
        `this.${node.getName()} = ${node.getName()}.bind(this)`
      );
    }

    if (Node.isExpressionStatement(node)) {
      const expression = node.getExpression();
      if (Node.isCallExpression(expression)) {
        // hooks, effects, basically Function calls
        const functionName = expression.getExpression().getText();
        if (
          functionName.endsWith('Metadata') &&
          functionName.startsWith('define')
        ) {
          const type = functionName
            .replace('define', '')
            .replace('Metadata', '');
          const metadata =
            expression.getArguments()[0] as ObjectLiteralExpression;
          if (type === 'Directive') {
            targetMetadata.setExpression('Directive');
            targetMetadata.addArgument(`{standalone: true}`);
            targetMetadataArguments =
              targetMetadata.getArguments()[0] as ObjectLiteralExpression;
            // process the metadata
            processMetadata(metadata, targetMetadataArguments);
            // add Directive import
            targetSourceFile.addImportDeclaration({
              moduleSpecifier: '@angular/core',
              namedImports: [{ name: 'Directive' }],
            });
          } else if (type === 'Pipe') {
            // rename to Pipe
            targetMetadata.setExpression('Pipe');
            targetMetadata.addArgument(`{standalone: true}`);
            targetMetadataArguments =
              targetMetadata.getArguments()[0] as ObjectLiteralExpression;
            // process the metadata
            processMetadata(metadata, targetMetadataArguments);
            // add Pipe import
            targetSourceFile.addImportDeclaration({
              moduleSpecifier: '@angular/core',
              namedImports: [{ name: 'Pipe' }],
            });
          } else {
            // process the metadata
            processMetadata(metadata, targetMetadataArguments);
          }
        } else if (functionName === 'onInit') {
          const initFunction = expression.getArguments()[0];
          if (Node.isArrowFunction(initFunction)) {
            // add the property to the class
            targetClass.addProperty({
              name: 'onInit',
              kind: StructureKind.Property,
              scope: Scope.Protected,
            });

            // add the variable initializer to the constructor
            targetConstructor.addFunction({
              name: 'onInit',
              statements: initFunction
                .getStatements()
                .map((statement) => statement.getText()),
            });

            // assign the variable to the property
            targetConstructor.addStatements(`this.onInit = onInit.bind(this)`);
            targetClass.addMethod({
              name: 'ngOnInit',
              statements: `this.onInit();`,
            });
          }
        } else {
          targetConstructor.addStatements(node.getText());
        }
      }
    }
  });

  try {
    const importsMetadata = targetMetadataArguments.getProperty('imports');
    if (importsMetadata && Node.isPropertyAssignment(importsMetadata)) {
      const importsInitializer = importsMetadata.getInitializer();
      if (Node.isArrayLiteralExpression(importsInitializer)) {
        importsInitializer.addElement(declarations.filter(Boolean).join(', '));
      }
    } else {
      targetMetadataArguments.addPropertyAssignment({
        name: 'imports',
        initializer: `[${declarations.filter(Boolean).join(', ')}]`,
      });
    }
  } catch (e) {
    console.log(`[Analog] ${e}`);
  }

  if (!isProd) {
    // PROD probably does not need this
    targetSourceFile.formatText({ ensureNewLineAtEndOfFile: true });
    // console.log(fileName, targetSourceFile.getText());
  }

  return targetSourceFile.getText();
}

function processMetadata(
  metadataObject: ObjectLiteralExpression,
  targetMetadataArguments: ObjectLiteralExpression
) {
  metadataObject.getPropertiesWithComments().forEach((property) => {
    if (Node.isPropertyAssignment(property)) {
      const propertyName = property.getName();
      const propertyInitializer = property.getInitializer();

      if (propertyInitializer) {
        if (propertyName === 'selector') {
          // remove the existing selector
          targetMetadataArguments.getProperty('selector')?.remove();
          // add the new selector
          targetMetadataArguments.addPropertyAssignment({
            name: 'selector',
            initializer: propertyInitializer.getText(),
          });
        } else if (propertyName) {
          targetMetadataArguments.addPropertyAssignment({
            name: propertyName,
            initializer: propertyInitializer.getText(),
          });
        }
      }
    }
  });

  // if (Node.isObjectLiteralExpression(initializer)) {
  //   initializer.getPropertiesWithComments().forEach((property) => {
  //     if (Node.isPropertyAssignment(property)) {
  //       const propertyName = property.getName();
  //       const propertyInitializer = property.getInitializer();
  //       if (propertyInitializer) {
  //         if (propertyName === 'selector') {
  //           // remove the existing selector
  //           targetMetadataArguments.getProperty('selector')?.remove();
  //           // add the new selector
  //           targetMetadataArguments.addPropertyAssignment({
  //             name: 'selector',
  //             initializer: propertyInitializer.getText(),
  //           });
  //         } else {
  //           if (propertyName)
  //             targetMetadataArguments.addPropertyAssignment({
  //               name: propertyName,
  //               initializer: propertyInitializer.getText(),
  //             });
  //         }
  //       }
  //     }
  //   });
  // }
}
