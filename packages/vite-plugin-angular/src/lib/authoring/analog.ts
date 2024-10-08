import {
  ClassDeclaration,
  CodeBlockWriter,
  Expression,
  ImportAttributeStructure,
  ImportSpecifierStructure,
  Node,
  ObjectLiteralExpression,
  OptionalKind,
  Project,
  PropertyAssignment,
  Scope,
  SourceFile,
  SyntaxKind,
  VariableDeclaration,
  VariableDeclarationKind,
} from 'ts-morph';
import {
  DEFINE_METADATA,
  HOOKS_MAP,
  INVALID_METADATA_PROPERTIES,
  ON_DESTROY,
  ON_INIT,
  OUTPUT_FROM_OBSERVABLE,
  REQUIRED_SIGNALS_MAP,
  ROUTE_META,
  SCRIPT_TAG_REGEX,
  SIGNALS_MAP,
  STYLE_TAG_REGEX,
  TEMPLATE_TAG_REGEX,
} from './constants.js';

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
    return processAnalogScriptV2(
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

interface ClassMember {
  name: string;
  initializer?: Expression;
  declaration: VariableDeclaration;
  hasExportKeyword: boolean;
  isLet: boolean;
}

function processAnalogScriptV2(
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

  const sourceSyntaxList = ngSourceFile.getChildren()[0]; // SyntaxList

  if (!Node.isSyntaxList(sourceSyntaxList)) {
    throw new Error(`[Analog] invalid source syntax list ${fileName}`);
  }

  const importAttributes: { [key: string]: Array<string> } = {
    imports: [],
    viewProviders: [],
    providers: [],
    exposes: [],
  };

  const classMembers = new Map<string, ClassMember>(),
    callsQueue: Array<() => void> = [];

  for (const node of sourceSyntaxList.getChildren()) {
    // Handle import statements
    if (Node.isImportDeclaration(node)) {
      let importStruct = node.getStructure();

      // turns import './foo.analog' into import FooAnalogComponent from './foo.analog';
      if (
        !importStruct.namedImports?.length &&
        !importStruct.defaultImport &&
        (importStruct.moduleSpecifier.endsWith('.analog') ||
          importStruct.moduleSpecifier.endsWith('.ag'))
      ) {
        const generatedName = importStruct.moduleSpecifier.replace(
          /[^a-zA-Z]/g,
          ''
        );
        node.setDefaultImport(generatedName);
        importStruct = node.getStructure();
      }

      const { attributes, namedImports, defaultImport } = importStruct;
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
        if (defaultImport) importAttributes[foundAttribute].push(defaultImport);

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
        ...importStruct,
        attributes: passThroughAttributes.length
          ? passThroughAttributes
          : undefined,
      });

      continue;
    }

    const nodeFullText = node.getFullText();

    // variable statement
    if (Node.isVariableStatement(node)) {
      // NOTE: we do not support multiple declarations (i.e: const a, b, c)
      const declaration = node.getDeclarations()[0],
        isLet = node.getDeclarationKind() === VariableDeclarationKind.Let,
        hasExportKeyword = node.hasExportKeyword();

      // if exportable, we need to add it to the target file immediately
      if (hasExportKeyword) {
        targetSourceFile.addStatements(nodeFullText);
      }

      const name = declaration.getName(),
        initializer = declaration.getInitializer(),
        nameNode = declaration.getNameNode();

      if (
        Node.isArrayBindingPattern(nameNode) ||
        Node.isObjectBindingPattern(nameNode)
      ) {
        // destructuring
        // NOTE/TODO (chau): not supporting destructured variables for input/output
        targetConstructor.addStatements(nodeFullText);

        const bindingElements = nameNode
          .getDescendantsOfKind(SyntaxKind.BindingElement)
          .map((bindingElement) => bindingElement.getName());

        for (const bindingElement of bindingElements) {
          targetClass.addProperty({ name: bindingElement });
          targetConstructor.addStatements(
            `this.${bindingElement} = ${bindingElement};`
          );
        }
        continue;
      }

      classMembers.set(name, {
        name,
        initializer,
        declaration,
        isLet,
        hasExportKeyword,
      });
      continue;
    }

    // function declaration
    if (Node.isFunctionDeclaration(node)) {
      const functionName = node.getName();
      if (!functionName) continue;

      const hasExportKeyword = node.hasExportKeyword();

      if (hasExportKeyword) {
        targetSourceFile.addStatements(nodeFullText);
      }

      callsQueue.push(() => {
        if (hasExportKeyword) {
          targetClass.addProperty({
            name: functionName,
            initializer: functionName,
            isReadonly: true,
            scope: Scope.Protected,
          });
        } else {
          targetConstructor.addStatements([
            // bring the function over
            nodeFullText,
            // assign class property
            `this.${functionName} = ${functionName}.bind(this);`,
          ]);
        }
      });

      continue;
    }

    // expression  statement
    if (Node.isExpressionStatement(node)) {
      const expression = node.getExpression();
      if (!Node.isCallExpression(expression)) continue;

      // cifs, effects, top-level function calls
      const fnName = expression.getExpression().getText();
      if (fnName === DEFINE_METADATA) {
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

      if (fnName === ON_INIT || fnName === ON_DESTROY) {
        const initFunction = expression.getArguments()[0];
        if (!Node.isFunctionLikeDeclaration(initFunction)) continue;

        callsQueue.push(() => {
          // add the function to constructor
          targetConstructor.addStatements(
            `this.${fnName} = ${initFunction.getText()}`
          );

          // add life-cycle method to class
          targetClass.addMethod({
            name: HOOKS_MAP[fnName],
            statements: `this.${fnName}();`,
          });
        });

        continue;
      }

      // other function calls
      callsQueue.push(() => targetConstructor.addStatements(nodeFullText));
    }
  }

  const gettersSetters: Array<{ propertyName: string; isFunction: boolean }> =
    [];

  for (const classMember of classMembers.values()) {
    const { isLet, hasExportKeyword, name, initializer, declaration } =
      classMember;
    if (isLet && hasExportKeyword) {
      console.warn(`[Analog] let variable cannot be exported: ${name}`);
      continue;
    }

    if (isLet) {
      targetConstructor.addStatements((writer) => {
        writer.write(`let ${name}`);
        if (initializer) writer.write(`=${initializer.getText()}`);
        writer.write(';');
      });
      // push to gettersSetters
      gettersSetters.push({
        propertyName: name,
        isFunction:
          !!initializer && Node.isFunctionLikeDeclaration(initializer),
      });
    } else {
      targetClass.addProperty({
        name,
        initializer: (writer) => {
          if (hasExportKeyword) {
            writer.write(name);
          } else {
            processInitializer(writer, declaration, classMembers, initializer);
          }
        },
        isReadonly: hasExportKeyword,
        scope: hasExportKeyword ? Scope.Protected : undefined,
      });
      if (name !== ROUTE_META) {
        targetConstructor.addStatements((writer) => {
          writer.write(`const ${name} = this.${name};`);
        });
      }
    }
  }

  for (const call of callsQueue) {
    call();
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
        isReadonly: true,
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

  if (gettersSetters.length) {
    targetConstructor.addStatements(`
Object.defineProperties(this, {
${gettersSetters.reduce((acc, { isFunction, propertyName }) => {
  acc += `${propertyName}: {set(v){${propertyName}=v;}${
    isFunction
      ? `value: ${propertyName}.bind(this)`
      : `get(){return ${propertyName}}`
  }},\n`;

  return acc;
}, '')}
})`);
  }

  if (!isProd) {
    // PROD probably does not need this
    targetSourceFile.formatText({ ensureNewLineAtEndOfFile: true });
  }

  // remove all empty lines
  return targetSourceFile.getText(false).replace(/\n\s*\n/g, '\n');
}

function processInitializer(
  writer: CodeBlockWriter,
  declaration: VariableDeclaration,
  classMembers: Map<string, ClassMember>,
  initializer?: Expression
) {
  if (!initializer) {
    console.warn(
      `[Analog] const variable must have an initializer: ${declaration.getName()}`
    );
    return;
  }

  if (Node.isCallExpression(initializer)) {
    // IO, queries, other callable things
    const expression = initializer.getExpression(),
      expressionText = expression.getText();
    if (REQUIRED_SIGNALS_MAP[expressionText] || SIGNALS_MAP[expressionText]) {
      // outputFromObservable
      if (expressionText === OUTPUT_FROM_OBSERVABLE) {
        const arg = initializer.getArguments()[0];

        let isClassMember = false;

        if (Node.isPropertyAccessExpression(arg) || Node.isIdentifier(arg)) {
          // outputFromObservable(stream$);
          // outputFromObservable(store.stream$);
          const argExpr = Node.isIdentifier(arg)
            ? arg.getText()
            : arg.getExpression().getText();

          isClassMember = classMembers.has(argExpr);
        } else if (Node.isCallExpression(arg)) {
          // outputFromObservable(thing());
          // outputFromObservable(other.thing());
          let deepestExpression = arg.getExpression();
          while (Node.isPropertyAccessExpression(deepestExpression)) {
            deepestExpression = deepestExpression.getExpression();
          }

          isClassMember =
            Node.isIdentifier(deepestExpression) &&
            classMembers.has(deepestExpression.getText());
        }

        writer.write(expressionText);
        writer.write(`(`);
        writer.write(isClassMember ? `this.${arg.getText()}` : arg.getText());
        writer.write(`)`);

        return;
      }

      // TODO (chau): complex transform for inputs does not work properly
      writer.write(initializer.getText());
      return;
    }

    writer.write(initializer.getText());
    return;
  }

  // regular `const var = initializer;`
  writer.write(initializer.getText());
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
            isReadonly: true,
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
