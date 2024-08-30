import {
  ArrowFunction,
  ClassDeclaration,
  ConstructorDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  ImportAttributeStructure,
  ImportDeclaration,
  ImportSpecifierStructure,
  Node,
  ObjectLiteralExpression,
  OptionalKind,
  Project,
  PropertyAssignment,
  PropertyDeclarationStructure,
  Scope,
  SourceFile,
  StructureKind,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';
import {
  HOOKS_MAP,
  INVALID_METADATA_PROPERTIES,
  ON_DESTROY,
  ON_INIT,
  REQUIRED_SIGNALS_MAP,
  SCRIPT_TAG_REGEX,
  SIGNALS_MAP,
  STYLE_TAG_REGEX,
  TEMPLATE_TAG_REGEX,
} from './constants.js';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function compileAnalogFile(
  filePath: string,
  fileContent: string,
  shouldFormat = false
) {
  const componentName = filePath.split('/').pop()?.split('.')[0];
  if (!componentName) {
    throw new Error(`[Analog] Missing component name ${filePath}`);
  }

  const [componentFileName, className] = [
    toFileName(componentName),
    toClassName(componentName),
  ];

  const isMarkdown = fileContent.includes('lang="md"');

  const [scriptContent, styleContent] = [
    SCRIPT_TAG_REGEX.exec(fileContent)?.pop()?.trim() || '',
    STYLE_TAG_REGEX.exec(fileContent)?.pop()?.trim() || '',
  ];

  const templateContentMatches = TEMPLATE_TAG_REGEX.exec(fileContent) ?? [];
  const templateAttributeString =
    templateContentMatches[2]?.trim().replace(/\n/g, '') ?? '';

  let templateContent = '';

  if (!isMarkdown) {
    templateContent = templateContentMatches[3]?.trim() || '';
  }

  let ngType: 'Component' | 'Directive';
  if (templateContent || isMarkdown) {
    ngType = 'Component';
  } else if (scriptContent && !templateContent) {
    ngType = scriptContent.includes('templateUrl') ? 'Component' : 'Directive';
  } else {
    throw new Error(`[Analog] Cannot determine entity type ${filePath}`);
  }

  const entityName = `${className}Analog${ngType}`;
  const componentMetadata = (() => {
    if (ngType === 'Component') {
      const items = ['changeDetection: ChangeDetectionStrategy.OnPush'];

      if (isMarkdown) {
        items.push(
          `templateUrl: \`virtual-analog:${filePath.replace('.ts', '')}\``
        );
      } else if (templateContent) {
        items.push(`template: \`${templateContent}\``);
      }

      if (styleContent) {
        items.push(`styles: \`${styleContent.replaceAll('\n', '')}\``);
      }

      if (templateAttributeString) {
        const attributes = parseAttributes(templateAttributeString);
        items.push(`host: ${JSON.stringify(attributes)}`);
      }

      return items.join(',\n  ');
    }
    return '';
  })();

  const source = `
import { ${ngType}${
    ngType === 'Component' ? ', ChangeDetectionStrategy' : ''
  } } from '@angular/core';

@${ngType}({
  standalone: true,
  selector: '${componentFileName},${className}',
  ${componentMetadata}
})
export default class ${entityName} {
  constructor() {}
}`;

  // the `.analog` file
  if (scriptContent) {
    const project = new Project({ useInMemoryFileSystem: true });
    return processAnalogScript(
      filePath,
      project.createSourceFile(filePath, scriptContent),
      project.createSourceFile(`${filePath}.virtual.ts`, source),
      ngType,
      entityName,
      shouldFormat
    );
  }

  return source;
}

function processAnalogScript(
  fileName: string,
  ngSourceFile: SourceFile,
  targetSourceFile: SourceFile,
  ngType: 'Component' | 'Directive',
  entityName: string,
  isProd?: boolean
) {
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

  const targetConstructor = targetClass.getConstructors()[0],
    targetConstructorBody = targetConstructor.getBody();

  if (!Node.isBlock(targetConstructorBody)) {
    throw new Error(`[Analog] invalid constructor body ${fileName}`);
  }

  const importAttributes: { [key: string]: Array<string> } = {
    imports: [],
    viewProviders: [],
    providers: [],
    exposes: [],
  };

  const gettersSetters: Array<{ propertyName: string; isFunction: boolean }> =
      [],
    outputs: Array<string> = [],
    sourceSyntaxList = ngSourceFile.getChildren()[0]; // SyntaxList

  if (!Node.isSyntaxList(sourceSyntaxList)) {
    throw new Error(`[Analog] invalid source syntax list ${fileName}`);
  }

  for (const node of sourceSyntaxList.getChildren()) {
    if (Node.isImportDeclaration(node)) {
      let structure = node.getStructure();

      if (
        !structure.namedImports?.length &&
        !structure.defaultImport &&
        (structure.moduleSpecifier.endsWith('.analog') ||
          structure.moduleSpecifier.endsWith('.ag'))
      ) {
        const generatedName = structure.moduleSpecifier.replace(
          /[^a-zA-Z]/g,
          ''
        );
        (node as ImportDeclaration).setDefaultImport(generatedName);
        structure = node.getStructure();
      }

      const attributes = structure.attributes;
      const passThroughAttributes: OptionalKind<ImportAttributeStructure>[] =
        [];
      let foundAttribute = '';

      for (const attribute of attributes || []) {
        if (attribute.name === 'analog') {
          const value = attribute.value.replaceAll("'", '');
          if (!(value in importAttributes)) {
            throw new Error(
              `[Analog] Invalid Analog import attribute ${value} in ${fileName}`
            );
          }
          foundAttribute = value;
          continue;
        }

        passThroughAttributes.push(attribute);
      }

      if (foundAttribute) {
        const { defaultImport, namedImports } = structure;
        if (defaultImport) {
          importAttributes[foundAttribute].push(defaultImport);
        }

        if (namedImports && Array.isArray(namedImports)) {
          const namedImportStructures = namedImports.filter(
            (
              namedImport
            ): namedImport is OptionalKind<ImportSpecifierStructure> =>
              typeof namedImport === 'object'
          );
          const importNames = namedImportStructures.map(
            (namedImport) => namedImport.alias ?? namedImport.name
          );
          importAttributes[foundAttribute].push(...importNames);
        }
      }

      // copy the import to the target `.analog.ts` file
      targetSourceFile.addImportDeclaration({
        ...structure,
        attributes: passThroughAttributes.length
          ? passThroughAttributes
          : undefined,
      });
      continue;
    }

    const nodeFullText = node.getFullText();

    if (Node.isExportable(node) && node.hasExportKeyword()) {
      targetSourceFile.addStatements(nodeFullText);
      continue;
    }

    if (Node.isVariableStatement(node)) {
      // NOTE: we do not support multiple declarations (i.e: const a, b, c)
      const declaration = node.getDeclarations()[0],
        isLet = node.getDeclarationKind() === VariableDeclarationKind.Let;

      const name = declaration.getName(),
        initializer = declaration.getInitializer();

      if (!initializer && isLet) {
        // transfer the whole line `let variable;` over
        addVariableToConstructor(targetConstructor, '', name, 'let');
        // populate getters array for Object.defineProperties
        gettersSetters.push({ propertyName: name, isFunction: false });

        continue;
      }

      if (initializer) {
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
            continue;
          }

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
          continue;
        }

        const isFunctionInitializer = isFunction(initializer);

        if (!isLet) {
          const ioStructure = getIOStructure(initializer);

          if (ioStructure) {
            // outputs
            if (ioStructure.decorators) {
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

            continue;
          }

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
          continue;
        }

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

        continue;
      }

      continue;
    }

    if (Node.isFunctionDeclaration(node)) {
      const functionName = node.getName();
      if (functionName) {
        targetConstructor.addStatements([
          // bring the function over
          nodeFullText,
          // assign class property
          `this.${functionName} = ${functionName}.bind(this);`,
        ]);

        continue;
      }

      continue;
    }

    if (Node.isExpressionStatement(node)) {
      const expression = node.getExpression();

      if (Node.isCallExpression(expression)) {
        // hooks, effects, basically Function calls
        const functionName = expression.getExpression().getText();
        if (functionName === 'defineMetadata') {
          const metadata =
            expression.getArguments()[0] as ObjectLiteralExpression;
          const metadataProperties = metadata
            .getPropertiesWithComments()
            .filter(
              (property): property is PropertyAssignment =>
                Node.isPropertyAssignment(property) &&
                !INVALID_METADATA_PROPERTIES.includes(property.getName())
            );

          if (metadataProperties.length === 0) continue;

          processMetadata(
            metadataProperties,
            targetMetadataArguments,
            targetClass
          );
          continue;
        }

        if (functionName === ON_INIT || functionName === ON_DESTROY) {
          const initFunction = expression.getArguments()[0];
          if (isFunction(initFunction)) {
            // add the function to constructor
            targetConstructor.addStatements(
              `this.${functionName} = ${initFunction.getText()}`
            );

            // add life-cycle method to class
            targetClass.addMethod({
              name: HOOKS_MAP[functionName],
              statements: `this.${functionName}();`,
            });
            continue;
          }

          continue;
        }

        // just add the entire node to the constructor. i.e: effect()
        targetConstructor.addStatements(nodeFullText);
      }
    }
  }

  if (ngType === 'Component') {
    if (importAttributes['viewProviders'].length) {
      processArrayLiteralMetadata(
        targetMetadataArguments,
        'viewProviders',
        importAttributes['viewProviders']
      );
    }

    if (importAttributes['imports'].length) {
      processArrayLiteralMetadata(
        targetMetadataArguments,
        'imports',
        importAttributes['imports']
      );
    }

    if (importAttributes['exposes'].length) {
      const exposes = importAttributes['exposes'].map((item) => ({
        name: item.trim(),
        initializer: item.trim(),
        scope: Scope.Protected,
      }));

      targetClass.addProperties(exposes);
    }
  }

  if (importAttributes['providers'].length) {
    processArrayLiteralMetadata(
      targetMetadataArguments,
      'providers',
      importAttributes['providers']
    );
  }

  if (outputs.length) {
    processArrayLiteralMetadata(
      targetMetadataArguments,
      'outputs',
      outputs.map((output) => `'${output}'`)
    );
  }

  if (gettersSetters.length) {
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

function processArrayLiteralMetadata(
  targetMetadataArguments: ObjectLiteralExpression,
  metadataName: string,
  items: string[]
) {
  let metadata = targetMetadataArguments.getProperty(metadataName);

  if (!metadata) {
    metadata = targetMetadataArguments.addPropertyAssignment({
      name: metadataName,
      initializer: '[]',
    });
  }

  const initializer =
    Node.isPropertyAssignment(metadata) && metadata.getInitializer();

  if (initializer && Node.isArrayLiteralExpression(initializer)) {
    initializer.addElements(items);
  }
}

function processMetadata(
  metadataProperties: PropertyAssignment[],
  targetMetadataArguments: ObjectLiteralExpression,
  targetClass: ClassDeclaration
) {
  metadataProperties.forEach((property) => {
    const propertyInitializer = property.getInitializer();
    if (propertyInitializer) {
      const propertyName = property.getName(),
        propertyInitializerText = propertyInitializer.getText();

      if (propertyName === 'selector') {
        // remove the existing selector
        targetMetadataArguments.getProperty('selector')?.remove();
        // add the new selector
        targetMetadataArguments.addPropertyAssignment({
          name: 'selector',
          initializer: propertyInitializerText,
        });
      } else if (propertyName === 'exposes') {
        // for exposes we're going to add the property to the class so they are accessible on the template
        // parse the initializer to get the item in the exposes array
        const exposes = propertyInitializerText
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
          initializer: propertyInitializerText,
        });
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

  targetConstructor.addStatements(statement + ';');
}

function isFunction(
  initializer: Node
): initializer is ArrowFunction | FunctionDeclaration | FunctionExpression {
  return (
    Node.isArrowFunction(initializer) ||
    Node.isFunctionDeclaration(initializer) ||
    Node.isFunctionExpression(initializer)
  );
}

function getIOStructure(
  initializer: Node
): Omit<OptionalKind<PropertyDeclarationStructure>, 'name'> | null {
  const callableExpression =
    (Node.isCallExpression(initializer) || Node.isNewExpression(initializer)) &&
    initializer;

  if (!callableExpression) return null;

  const expression = callableExpression.getExpression(),
    initializerText = callableExpression.getText();

  if (initializerText.includes('new EventEmitter')) {
    return {
      initializer: initializerText,
      decorators: [{ name: 'Output', arguments: [] }],
    };
  }

  if (
    (Node.isPropertyAccessExpression(expression) &&
      REQUIRED_SIGNALS_MAP[expression.getText()]) ||
    (Node.isIdentifier(expression) && SIGNALS_MAP[expression.getText()])
  ) {
    return { initializer: initializer.getText() };
  }

  return null;
}

/**
 * Hyphenated to UpperCamelCase
 */
function toClassName(str: string) {
  return toCapitalCase(toPropertyName(str));
}
/**
 * Hyphenated to lowerCamelCase
 */
function toPropertyName(str: string) {
  return str
    .replace(/([^a-zA-Z0-9])+(.)?/g, (_, __, chr) =>
      chr ? chr.toUpperCase() : ''
    )
    .replace(/[^a-zA-Z\d]/g, '')
    .replace(/^([A-Z])/, (m) => m.toLowerCase())
    .replace(/^\d+/, '');
}

/**
 * Upper camelCase to lowercase, hyphenated
 */
function toFileName(str: string) {
  return str
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/(?!^[_])[ _]/g, '-')
    .replace(/^\d+-?/, '');
}
/**
 * Capitalizes the first letter of a string
 */
function toCapitalCase(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parses the attribute string and returns a key-value pair
 *
 * @param attributeString
 */
function parseAttributes(attributeString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s"'=]+)=?(?:(["'])(.*?\2)|(.+?))(?=\s|$)/g; // Regex to capture key-value pairs

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attributeString)) !== null) {
    const [, key, , quotedValue, unquotedValue] = match;
    let value = quotedValue || unquotedValue || ''; // Use quoted or unquoted value
    if (value.endsWith('"')) {
      value = value.slice(0, -1);
    }
    attributes[key.trim()] = value.trim();
  }

  return attributes;
}
