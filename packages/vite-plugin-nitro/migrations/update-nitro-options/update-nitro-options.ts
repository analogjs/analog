import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import * as ts from 'typescript';

const NITRO_PLUGIN_PKG = '@analogjs/vite-plugin-nitro';
const VITE_CONFIG_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'];

/**
 * Keys that only exist on the Analog options, so an object using any of them
 * was passed as the old first argument.
 */
const ANALOG_ONLY_KEYS = new Set([
  'ssr',
  'ssrBuildDir',
  'entryServer',
  'index',
  'sourceRoot',
  'workspaceRoot',
  'additionalPagesDirs',
  'additionalAPIDirs',
  'additionalServerFnDirs',
  'apiPrefix',
  'useAPIMiddleware',
  'i18n',
]);

interface Edit {
  start: number;
  end: number;
  text: string;
}

function isViteConfig(filePath: string): boolean {
  const file = filePath.slice(filePath.lastIndexOf('/') + 1);
  return (
    file.startsWith('vite.config.') &&
    VITE_CONFIG_EXTENSIONS.some((ext) => file.endsWith(ext))
  );
}

/** Local names `nitro()` is imported under from the plugin package. */
function getNitroImportNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== NITRO_PLUGIN_PKG
    ) {
      continue;
    }
    const clause = statement.importClause;
    if (clause?.name) {
      names.add(clause.name.text);
    }
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if ((element.propertyName ?? element.name).text === 'nitro') {
          names.add(element.name.text);
        }
      }
    }
  }
  return names;
}

function usesAnalogOnlyKeys(node: ts.ObjectLiteralExpression): boolean {
  return node.properties.some(
    (prop) =>
      prop.name !== undefined &&
      (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
      ANALOG_ONLY_KEYS.has(prop.name.text),
  );
}

function isEmptyObject(node: ts.Expression): boolean {
  return ts.isObjectLiteralExpression(node) && node.properties.length === 0;
}

/**
 * Rewrites the old `nitro(options, nitroConfig)` calls to the single
 * `nitro({ ...nitroConfig, analog: options })` argument. Returns `null` when a
 * call can't be rewritten safely.
 */
function rewriteCall(
  call: ts.CallExpression,
  source: string,
  sourceFile: ts.SourceFile,
): Edit | undefined | null {
  const text = (node: ts.Node) =>
    source.slice(node.getStart(sourceFile), node.getEnd());
  const [options, nitroConfig] = call.arguments;
  let argument: string;

  if (nitroConfig) {
    const analog = isEmptyObject(options) ? '' : `analog: ${text(options)}`;
    if (ts.isObjectLiteralExpression(nitroConfig)) {
      const props = nitroConfig.properties.map(text);
      argument = `{ ${[...props, analog].filter(Boolean).join(', ')} }`;
    } else {
      argument = analog
        ? `{ ...${text(nitroConfig)}, ${analog} }`
        : text(nitroConfig);
    }
  } else if (!options || isEmptyObject(options)) {
    return undefined;
  } else if (ts.isObjectLiteralExpression(options)) {
    if (!usesAnalogOnlyKeys(options)) {
      return undefined;
    }
    argument = `{ analog: ${text(options)} }`;
  } else {
    return null;
  }

  // Replace everything between the parentheses, including a trailing comma.
  return {
    start: call.arguments.pos,
    end: call.getEnd() - 1,
    text: argument,
  };
}

function transformViteConfig(
  filePath: string,
  source: string,
): { source: string; unhandled: boolean } | null {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const names = getNitroImportNames(sourceFile);
  if (!names.size) {
    return null;
  }

  const edits: Edit[] = [];
  let unhandled = false;

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      names.has(node.expression.text)
    ) {
      const edit = rewriteCall(node, source, sourceFile);
      if (edit === null) {
        unhandled = true;
      } else if (edit) {
        edits.push(edit);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  // Apply right-to-left so earlier offsets stay valid.
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return { source: result, unhandled };
}

export default function updateNitroOptions(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const rewrittenFiles: string[] = [];
    const unhandledFiles: string[] = [];

    tree.visit((filePath) => {
      if (filePath.includes('/node_modules/') || !isViteConfig(filePath)) {
        return;
      }
      const content = tree.read(filePath);
      if (!content) return;

      const source = content.toString('utf-8');
      const transformed = transformViteConfig(filePath, source);
      if (!transformed) return;

      if (transformed.source !== source) {
        tree.overwrite(filePath, transformed.source);
        rewrittenFiles.push(filePath);
      }
      if (transformed.unhandled) {
        unhandledFiles.push(filePath);
      }
    });

    if (rewrittenFiles.length) {
      context.logger.info(
        `Moved nitro() options to its single argument in: ${rewrittenFiles.join(', ')}`,
      );
    }
    if (unhandledFiles.length) {
      context.logger.warn(
        `Could not rewrite every nitro() call in: ${unhandledFiles.join(', ')}. ` +
          'nitro() now takes the Nitro config, with Analog options under `analog`: ' +
          '`nitro({ ...nitroConfig, analog: options })`.',
      );
    }

    return tree;
  };
}
