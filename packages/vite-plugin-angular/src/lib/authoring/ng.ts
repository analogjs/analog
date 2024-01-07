import {
  ClassDeclaration,
  ConstructorDeclaration,
  Expression,
  FunctionDeclaration,
  Node,
  ObjectLiteralExpression,
  Project,
  Scope,
  StructureKind,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';

const SCRIPT_TAG_REGEX = /<script lang="ts">([\s\S]*?)<\/script>/i;
const TEMPLATE_TAG_REGEX = /<template>([\s\S]*?)<\/template>/i;
const STYLE_TAG_REGEX = /<style>([\s\S]*?)<\/style>/i;

const ON_INIT = 'onInit';
const ON_DESTROY = 'onDestroy';

export function compileNgFile(
  filePath: string,
  fileContent: string,
  shouldFormat = false
) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { names } = require('@nx/devkit');

  const componentName = filePath.split('/').pop()?.split('.')[0];
  if (!componentName) {
    throw new Error(`[Analog] Missing component name ${filePath}`);
  }

  const {
    fileName: componentFileName,
    className,
    constantName,
  } = names(componentName);

  // eslint-disable-next-line prefer-const
  let [scriptContent, templateContent, styleContent] = [
    SCRIPT_TAG_REGEX.exec(fileContent)?.pop()?.trim() || '',
    TEMPLATE_TAG_REGEX.exec(fileContent)?.pop()?.trim() || '',
    STYLE_TAG_REGEX.exec(fileContent)?.pop()?.trim() || '',
  ];

  if (!scriptContent && !templateContent) {
    throw new Error(
      `[Analog] Either <script> or <template> must exist in ${filePath}`
    );
  }

  const ngType = templateContent ? 'Component' : 'Directive';

  if (styleContent) {
    templateContent = `<style>${styleContent.replace(/\n/g, '')}</style>
${templateContent}`;
  }

  const source = `
import { ${ngType}${
    ngType === 'Component' ? ', ChangeDetectionStrategy' : ''
  } } from '@angular/core';

@${ngType}({
  standalone: true,
  selector: '${componentFileName},${className},${constantName}',
  ${
    ngType === 'Component'
      ? `changeDetection: ChangeDetectionStrategy.OnPush,
      template: \`${templateContent}\``
      : ''
  }
})
export default class AnalogNgEntity {
  constructor() {}
}`;

  // the `.ng` file
  if (scriptContent) {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(filePath, scriptContent);
    project.createSourceFile(`${filePath}.virtual.ts`, source);

    return processNgScript(filePath, project, ngType, shouldFormat);
  }

  return source;
}

function processNgScript(
  fileName: string,
  project: Project,
  ngType: 'Component' | 'Directive',
  isProd?: boolean
) {
  const ngSourceFile = project.getSourceFile(fileName);
  const targetSourceFile = project.getSourceFile(`${fileName}.virtual.ts`);

  if (!ngSourceFile || !targetSourceFile) {
    throw new Error(`[Analog] Missing source files ${fileName}`);
  }

  const targetClass = targetSourceFile.getClass(
    (classDeclaration) => classDeclaration.getName() === 'AnalogNgEntity'
  );

  if (!targetClass) {
    throw new Error(`[Analog] Missing class ${fileName}`);
  }

  const targetMetadata = targetClass.getDecorator(ngType);

  if (!targetMetadata) {
    throw new Error(`[Analog] Missing metadata ${fileName}`);
  }

  const targetMetadataArguments =
    targetMetadata.getArguments()[0] as ObjectLiteralExpression;

  if (!Node.isObjectLiteralExpression(targetMetadataArguments)) {
    throw new Error(`[Analog] invalid metadata arguments ${fileName}`);
  }

  const targetConstructor = targetClass.getConstructors()[0];
  const targetConstructorBody = targetConstructor.getBody();

  if (!Node.isBlock(targetConstructorBody)) {
    throw new Error(`[Analog] invalid constructor body ${fileName}`);
  }

  const declarations: string[] = [];
  const getters: Array<{ propertyName: string; isFunction: boolean }> = [];

  ngSourceFile.forEachChild((node) => {
    // for ImportDeclaration (e.g: import ... from ...)
    if (Node.isImportDeclaration(node)) {
      const moduleSpecifier = node.getModuleSpecifierValue();
      if (moduleSpecifier.endsWith('.ng')) {
        // other .ng files
        declarations.push(node.getDefaultImport()?.getText() || '');
      }

      // copy the import to the target `.ng.ts` file
      targetSourceFile.addImportDeclaration(node.getStructure());
    }

    // for VariableStatement (e.g: const ... = ..., let ... = ...)
    if (Node.isVariableStatement(node)) {
      // NOTE: we do not support multiple declarations (i.e: const a, b, c)
      const declarations = node.getDeclarations();
      const declaration = declarations[0];
      const isLet = node.getDeclarationKind() === VariableDeclarationKind.Let;
      const initializer = declaration.getInitializer();

      if (!initializer && isLet) {
        targetConstructor.addStatements(node.getText());
        getters.push({
          propertyName: declaration.getName(),
          isFunction: false,
        });
      } else if (initializer) {
        const declarationNameNode = declaration.getNameNode();

        // destructures
        if (
          Node.isArrayBindingPattern(declarationNameNode) ||
          Node.isObjectBindingPattern(declarationNameNode)
        ) {
          targetConstructor.addStatements(node.getText());

          const bindingElements = declarationNameNode
            .getDescendantsOfKind(SyntaxKind.BindingElement)
            .map((bindingElement) => bindingElement.getName());

          if (isLet) {
            getters.push(
              ...bindingElements.map((bindingElement) => ({
                propertyName: bindingElement,
                isFunction: false,
              }))
            );
          } else {
            for (const bindingElement of bindingElements) {
              targetClass.addProperty({
                name: bindingElement,
                kind: StructureKind.Property,
                scope: Scope.Protected,
              });
              targetConstructor.addStatements(
                `this.${bindingElement} = ${bindingElement};`
              );
            }
          }
        } else {
          addPropertyToClass(
            targetClass,
            targetConstructor,
            declaration.getName(),
            initializer,
            isLet,
            (isFunction, propertyName) => {
              targetConstructor.addStatements(node.getText());
              if (isLet) {
                getters.push({ propertyName, isFunction });
              }
            }
          );
        }
      }
    }

    if (Node.isFunctionDeclaration(node)) {
      addPropertyToClass(
        targetClass,
        targetConstructor,
        node.getName() || '',
        node,
        false,
        (_, propertyName) => {
          targetConstructor.addFunction({
            name: propertyName,
            parameters: node
              .getParameters()
              .map((parameter) => parameter.getStructure()),
            statements: node
              .getStatements()
              .map((statement) => statement.getText()),
          });
        }
      );
    }

    if (Node.isExpressionStatement(node)) {
      const expression = node.getExpression();
      if (Node.isCallExpression(expression)) {
        // hooks, effects, basically Function calls
        const functionName = expression.getExpression().getText();
        if (functionName === 'defineMetadata') {
          const metadata =
            expression.getArguments()[0] as ObjectLiteralExpression;
          processMetadata(metadata, targetMetadataArguments, targetClass);
        } else if (functionName === ON_INIT || functionName === ON_DESTROY) {
          const initFunction = expression.getArguments()[0];
          if (Node.isArrowFunction(initFunction)) {
            addPropertyToClass(
              targetClass,
              targetConstructor,
              functionName,
              initFunction,
              false,
              (_isFunction, propertyName) => {
                targetConstructor.addFunction({
                  name: propertyName,
                  statements: initFunction
                    .getStatements()
                    .map((statement) => statement.getText()),
                });

                targetClass.addMethod({
                  name: functionName === ON_INIT ? 'ngOnInit' : 'ngOnDestroy',
                  statements: `this.${propertyName}();`,
                });
              }
            );
          }
        } else {
          targetConstructor.addStatements(node.getText());
        }
      }
    }
  });

  if (ngType === 'Component') {
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
  }

  if (getters.length > 0) {
    targetConstructor.addStatements(`
Object.defineProperties(this, {
${getters
  .map(
    ({ isFunction, propertyName }) =>
      `${propertyName}:{get(){return ${
        !isFunction ? `${propertyName}` : `${propertyName}.bind(this)`
      };}},`
  )
  .join('\n')}
});`);
  }

  if (!isProd) {
    // PROD probably does not need this
    targetSourceFile.formatText({ ensureNewLineAtEndOfFile: true });
  }

  return targetSourceFile.getText();
}

function processMetadata(
  metadataObject: ObjectLiteralExpression,
  targetMetadataArguments: ObjectLiteralExpression,
  targetClass: ClassDeclaration
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
        } else if (propertyName === 'exposes') {
          // for exposes we're going to add the property to the class so they are accessible on the template
          // parse the initializer to get the item in the exposes array
          const exposes = propertyInitializer
            .getText()
            .replace(/[[\]]/g, '')
            .split(',')
            .map((item) => ({
              name: item.trim(),
              initializer: item.trim(),
              scope: Scope.Protected,
            }));

          targetClass.addProperties(exposes);
        } else {
          targetMetadataArguments.addPropertyAssignment({
            name: propertyName,
            initializer: propertyInitializer.getText(),
          });
        }
      }
    }
  });
}

function addPropertyToClass<
  TInitializer extends Expression | FunctionDeclaration
>(
  targetClass: ClassDeclaration,
  targetConstructor: ConstructorDeclaration,
  propertyName: string,
  propertyInitializer: TInitializer,
  isLet: boolean,
  constructorUpdater: (isFunction: boolean, propertyName: string) => void
) {
  if (!isLet) {
    // add the empty property the class (e.g: protected propertyName;)
    targetClass.addProperty({
      name: propertyName,
      kind: StructureKind.Property,
      scope: Scope.Protected,
    });
  }

  const isFunction =
    Node.isArrowFunction(propertyInitializer) ||
    Node.isFunctionDeclaration(propertyInitializer);

  // update the constructor
  constructorUpdater(isFunction, propertyName);

  if (!isLet) {
    // assign the variable to the property
    targetConstructor.addStatements(
      isFunction
        ? `this.${propertyName} = ${propertyName}.bind(this);`
        : `this.${propertyName} = ${propertyName};`
    );
  }
}
