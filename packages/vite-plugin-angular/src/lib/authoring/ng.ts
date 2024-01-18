import {
  ArrowFunction,
  CallExpression,
  ClassDeclaration,
  ConstructorDeclaration,
  Expression,
  FunctionDeclaration,
  Identifier,
  NewExpression,
  Node,
  ObjectLiteralExpression,
  OptionalKind,
  Project,
  PropertyDeclarationStructure,
  Scope,
  StructureKind,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';
import { isFunctionDeclaration } from 'typescript';

const SCRIPT_TAG_REGEX = /<script lang="ts">([\s\S]*?)<\/script>/i;
const TEMPLATE_TAG_REGEX = /<template>([\s\S]*?)<\/template>/i;
const STYLE_TAG_REGEX = /<style>([\s\S]*?)<\/style>/i;

const ON_INIT = 'onInit';
const ON_DESTROY = 'onDestroy';

const HOOKS_MAP = {
  [ON_INIT]: 'ngOnInit',
  [ON_DESTROY]: 'ngOnDestroy',
} as const;

export function compileNgFile(
  filePath: string,
  fileContent: string,
  shouldFormat = false
) {
  const componentName = filePath.split('/').pop()?.split('.')[0];
  if (!componentName) {
    throw new Error(`[Analog] Missing component name ${filePath}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { names } = require('@nx/devkit');

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
  const entityName = `${className}Analog${ngType}`;

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
export default class ${entityName} {
  constructor() {}
}`;

  // the `.ng` file
  if (scriptContent) {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(filePath, scriptContent);
    project.createSourceFile(`${filePath}.virtual.ts`, source);

    return processNgScript(filePath, project, ngType, entityName, shouldFormat);
  }

  return source;
}

function processNgScript(
  fileName: string,
  project: Project,
  ngType: 'Component' | 'Directive',
  entityName: string,
  isProd?: boolean
) {
  const ngSourceFile = project.getSourceFile(fileName);
  const targetSourceFile = project.getSourceFile(`${fileName}.virtual.ts`);

  if (!ngSourceFile || !targetSourceFile) {
    throw new Error(`[Analog] Missing source files ${fileName}`);
  }

  const targetClass = targetSourceFile.getClass(
    (classDeclaration) => classDeclaration.getName() === entityName
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
  const gettersSetters: Array<{ propertyName: string; isFunction: boolean }> =
    [];
  const outputs: string[] = [];

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

    const nodeFullText = node.getText();

    // for VariableStatement (e.g: const ... = ..., let ... = ...)
    if (Node.isVariableStatement(node)) {
      // NOTE: we do not support multiple declarations (i.e: const a, b, c)
      const [declaration, isLet] = [
        node.getDeclarations()[0],
        node.getDeclarationKind() === VariableDeclarationKind.Let,
      ];

      const [name, initializer] = [
        declaration.getName(),
        declaration.getInitializer(),
      ];

      // let variable; // no initializer
      if (!initializer && isLet) {
        // transfer the whole line `let variable;` over
        addVariableToConstructor(targetConstructor, '', name, 'let');
        // populate getters array for Object.defineProperties
        gettersSetters.push({ propertyName: name, isFunction: false });
      } else if (initializer) {
        // with initializer
        const nameNode = declaration.getNameNode();

        // if destructured.
        // TODO: we don't have a good abstraction for handling destructured variables yet.
        if (
          Node.isArrayBindingPattern(nameNode) ||
          Node.isObjectBindingPattern(nameNode)
        ) {
          targetConstructor.addStatements(nodeFullText);

          const bindingElements = nameNode
            .getDescendantsOfKind(SyntaxKind.BindingElement)
            .map((bindingElement) => bindingElement.getName());

          if (isLet) {
            gettersSetters.push(
              ...bindingElements.map((propertyName) => ({
                propertyName,
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
          const isFunctionInitializer = isFunction(initializer);

          if (!isLet) {
            const ioStructure = getIOStructure(initializer);

            if (ioStructure) {
              // outputs
              if (!!ioStructure.decorators) {
                // track output name
                outputs.push(name);
              }

              // track output name
              targetClass.addProperty({
                ...ioStructure,
                decorators: undefined,
                name,
                scope: Scope.Protected,
              });

              // assign constructor variable
              targetConstructor.addStatements(`const ${name} = this.${name}`);
            } else {
              /**
               * normal property
               * const variable = initializer;
               * We'll create a class property with the same variable name
               */
              addVariableToConstructor(
                targetConstructor,
                initializer.getText(),
                name,
                'const',
                true
              );
            }
          } else {
            /**
             * let variable = initializer;
             * We will NOT create a class property with the name because we will add it to the getters
             */
            addVariableToConstructor(
              targetConstructor,
              initializer.getText(),
              name,
              'let'
            );
            gettersSetters.push({
              propertyName: name,
              isFunction: isFunctionInitializer,
            });
          }
        }
      }
    }

    // function fnName() {}
    if (Node.isFunctionDeclaration(node)) {
      const functionName = node.getName();
      if (functionName) {
        targetConstructor.addStatements([
          // bring the function over
          nodeFullText,
          // assign class property
          `this.${functionName} = ${functionName}.bind(this);`,
        ]);
      }
    }

    if (Node.isExpressionStatement(node)) {
      const expression = node.getExpression();
      if (Node.isCallExpression(expression)) {
        // hooks, effects, basically Function calls
        const functionName = expression.getExpression().getText();
        if (functionName === 'defineMetadata') {
          const metadata =
            expression.getArguments()[0] as ObjectLiteralExpression;
          processMetadata(
            metadata,
            targetMetadataArguments,
            targetClass,
            targetSourceFile
          );
        } else if (functionName === ON_INIT || functionName === ON_DESTROY) {
          const initFunction = expression.getArguments()[0];
          if (Node.isArrowFunction(initFunction)) {
            // add the function to constructor
            targetConstructor.addStatements(
              `this.${functionName} = ${initFunction.getText()}`
            );

            // add life-cycle method to class
            targetClass.addMethod({
              name: HOOKS_MAP[functionName],
              statements: `this.${functionName}();`,
            });
          }
        } else {
          // just add the entire node to the constructor. i.e: effect()
          targetConstructor.addStatements(node.getText());
        }
      }
    }
  });

  if (ngType === 'Component' && declarations.length) {
    const importsMetadata = targetMetadataArguments.getProperty('imports');
    const declarationSymbols = declarations.filter(Boolean).join(', ');

    if (importsMetadata && Node.isPropertyAssignment(importsMetadata)) {
      const importsInitializer = importsMetadata.getInitializer();
      if (Node.isArrayLiteralExpression(importsInitializer)) {
        importsInitializer.addElement(declarationSymbols);
      }
    } else {
      targetMetadataArguments.addPropertyAssignment({
        name: 'imports',
        initializer: `[${declarationSymbols}]`,
      });
    }
  }

  if (outputs.length > 0) {
    targetMetadataArguments.addPropertyAssignment({
      name: 'outputs',
      initializer: `[${outputs.map((output) => `'${output}'`).join(',')}]`,
    });
  }

  if (gettersSetters.length > 0) {
    targetConstructor.addStatements(`
Object.defineProperties(this, {
${gettersSetters
  .map(
    ({ isFunction, propertyName }) =>
      `${propertyName}:{get(){return ${
        !isFunction ? `${propertyName}` : `${propertyName}.bind(this)`
      };},set(v){${propertyName}=v;}},`
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
  targetClass: ClassDeclaration,
  targetSourceFile: any
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
        } else if (propertyName === 'route') {
          targetSourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
              {
                name: 'routeMeta',
                initializer: propertyInitializer.getText(),
              },
            ],
          });
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

/**
 * const variable = initializer;
 * |
 * v
 * constructor() {
 *  const variable = (this.variable = initializer);
 * }
 *
 */
function addVariableToConstructor(
  targetConstructor: ConstructorDeclaration,
  initializerText: string,
  variableName: string,
  kind: 'let' | 'const',
  withClassProperty = false
) {
  let statement = `${kind} ${variableName}`;

  if (initializerText) {
    statement += `= ${initializerText}`;

    if (withClassProperty) {
      statement = `${kind} ${variableName} = (this.${variableName} = ${initializerText})`;
    }
  }

  targetConstructor.addStatements((statement += ';'));
}

function isFunction(
  initializer: Node
): initializer is ArrowFunction | FunctionDeclaration {
  return (
    Node.isArrowFunction(initializer) || Node.isFunctionDeclaration(initializer)
  );
}

function getIOStructure(
  initializer: Node
): Omit<OptionalKind<PropertyDeclarationStructure>, 'name'> | null {
  const callableExpression =
    (Node.isCallExpression(initializer) || Node.isNewExpression(initializer)) &&
    initializer;

  if (!callableExpression) return null;

  const [expression, initializerText] = [
    callableExpression.getExpression(),
    callableExpression.getText(),
  ];

  if (initializerText.includes('new EventEmitter')) {
    return {
      initializer: initializerText,
      decorators: [{ name: 'Output', arguments: [] }],
    };
  }

  if (
    (Node.isPropertyAccessExpression(expression) &&
      expression.getText() === 'input.required') ||
    Node.isIdentifier(expression) ||
    expression.getText() === 'input'
  ) {
    return { initializer: initializer.getText() };
  }

  return null;
}
