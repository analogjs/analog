import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import * as ts from 'typescript';

const ANALOG_PLATFORM_IMPORT = `from '@analogjs/platform'`;
const ANGULAR_PLUGIN_IMPORT = `from '@analogjs/vite-plugin-angular'`;
const NITRO_VITE_IMPORT = `from 'nitro/vite'`;
const ANGULAR_PLUGIN_PKG = '@analogjs/vite-plugin-angular';
const NITRO_PKG = 'nitro';
const NITRO_VERSION = '3.0.260522-beta';
const MIGRATION_DOC_URL =
  'https://analogjs.org/docs/guides/migrating-v2-to-v3#analog-angular-and-nitro-are-now-separate-plugins';

const VITE_CONFIG_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'];

function isViteConfig(filePath: string): boolean {
  const file = filePath.slice(filePath.lastIndexOf('/') + 1);
  if (!file.startsWith('vite.config.')) {
    return false;
  }
  return VITE_CONFIG_EXTENSIONS.some((ext) => file.endsWith(ext));
}

function usesLegacyPluginShape(source: string): boolean {
  if (!source.includes(ANALOG_PLATFORM_IMPORT)) {
    return false;
  }
  if (
    source.includes(ANGULAR_PLUGIN_IMPORT) &&
    source.includes(NITRO_VITE_IMPORT)
  ) {
    return false;
  }
  return /\banalog\s*\(/.test(source);
}

function readPackageJson(
  tree: Tree,
): { raw: string; pkg: Record<string, unknown> } | null {
  const content = tree.read('/package.json');
  if (!content) return null;
  const raw = content.toString('utf-8');
  try {
    return { raw, pkg: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function getDepVersion(
  pkg: Record<string, unknown>,
  name: string,
): string | undefined {
  const dev =
    (pkg['devDependencies'] as Record<string, string> | undefined) ?? {};
  const reg = (pkg['dependencies'] as Record<string, string> | undefined) ?? {};
  return dev[name] ?? reg[name];
}

function addDependencies(tree: Tree, context: SchematicContext): boolean {
  const info = readPackageJson(tree);
  if (!info) return false;

  const { pkg, raw } = info;
  const devDeps = {
    ...((pkg['devDependencies'] as Record<string, string> | undefined) ?? {}),
  };
  let changed = false;

  if (!getDepVersion(pkg, ANGULAR_PLUGIN_PKG)) {
    // Match the @analogjs/platform pin so the angular plugin stays aligned
    // with the rest of the Analog packages already in this workspace.
    const platformVersion = getDepVersion(pkg, '@analogjs/platform') ?? '*';
    devDeps[ANGULAR_PLUGIN_PKG] = platformVersion;
    changed = true;
    context.logger.info(
      `Added '${ANGULAR_PLUGIN_PKG}': '${platformVersion}' to devDependencies.`,
    );
  }

  if (!getDepVersion(pkg, NITRO_PKG)) {
    devDeps[NITRO_PKG] = NITRO_VERSION;
    changed = true;
    context.logger.info(
      `Added '${NITRO_PKG}': '${NITRO_VERSION}' to devDependencies.`,
    );
  }

  if (!changed) return false;

  pkg['devDependencies'] = devDeps;
  const trailingNewline = raw.endsWith('\n') ? '\n' : '';
  tree.overwrite(
    '/package.json',
    JSON.stringify(pkg, null, 2) + trailingNewline,
  );
  context.addTask(new NodePackageInstallTask());
  return true;
}

interface TransformResult {
  source: string;
  movedVite: boolean;
  movedNitro: boolean;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

function applyEdits(source: string, edits: Edit[]): string {
  // Apply right-to-left so earlier offsets stay valid.
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

function getLineIndent(source: string, pos: number): string {
  let lineStart = pos;
  while (lineStart > 0 && source[lineStart - 1] !== '\n') {
    lineStart--;
  }
  let indent = '';
  for (let i = lineStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t') indent += ch;
    else break;
  }
  return indent;
}

/**
 * Tries to lift `vite: {...}` and `nitro: {...}` properties off the
 * single `analog(...)` call into companion `angular(...)` / `nitro(...)`
 * calls. Returns the rewritten source on success, or null if the file
 * doesn't match the supported pattern (we then fall back to logging
 * instructions rather than risking a corrupted file).
 *
 * Supported pattern: exactly one `analog(...)` call whose argument is
 * an object literal. Properties named `vite` and `nitro` are recognized;
 * everything else stays on `analog`.
 */
function tryTransformViteConfig(
  filePath: string,
  source: string,
): TransformResult | null {
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
  } catch {
    return null;
  }

  let analogImportEnd = -1;
  let angularImported = false;
  let nitroImported = false;
  let analogCalls: ts.CallExpression[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const ml = node.moduleSpecifier;
      if (ts.isStringLiteral(ml)) {
        if (ml.text === '@analogjs/platform') {
          analogImportEnd = node.end;
        } else if (ml.text === '@analogjs/vite-plugin-angular') {
          angularImported = true;
        } else if (ml.text === 'nitro/vite') {
          nitroImported = true;
        }
      }
    } else if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'analog'
      ) {
        analogCalls.push(node);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (analogImportEnd === -1) return null;
  if (analogCalls.length !== 1) return null;

  const analogCall = analogCalls[0];
  const callStart = analogCall.getStart(sourceFile);
  const callEnd = analogCall.getEnd();

  let viteValueText: string | null = null;
  let nitroValueText: string | null = null;
  let remainingPropsText: string | null = null;

  const arg = analogCall.arguments[0];
  if (arg && ts.isObjectLiteralExpression(arg)) {
    const remaining: ts.ObjectLiteralElementLike[] = [];
    for (const prop of arg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        (prop.name.text === 'vite' || prop.name.text === 'nitro')
      ) {
        const value = prop.initializer;
        const text = source.slice(value.getStart(sourceFile), value.getEnd());
        if (prop.name.text === 'vite') viteValueText = text;
        else nitroValueText = text;
      } else {
        remaining.push(prop);
      }
    }

    if (remaining.length > 0) {
      // Reconstruct the analog object literal from the remaining props,
      // preserving their original source text (comments, spacing).
      const propTexts = remaining.map((p) =>
        source.slice(p.getStart(sourceFile), p.getEnd()),
      );
      const objStart = arg.getStart(sourceFile);
      const indent = getLineIndent(source, objStart);
      const propIndent = indent + '  ';
      remainingPropsText = `{\n${propTexts.map((t) => `${propIndent}${t}`).join(',\n')},\n${indent}}`;
    }
  } else if (arg !== undefined) {
    // analog(otherExpression) — can't statically split a variable or call
    // expression. Fall back to logging instructions.
    return null;
  }
  // analog() with no argument falls through to the rewrite below; we just
  // emit `analog(), angular(), nitro()` to scaffold the new plugin chain.

  const indent = getLineIndent(source, callStart);
  const newAnalogCall = remainingPropsText
    ? `analog(${remainingPropsText})`
    : `analog()`;
  const parts: string[] = [newAnalogCall];
  if (viteValueText !== null) parts.push(`angular(${viteValueText})`);
  else parts.push('angular()');
  if (nitroValueText !== null) parts.push(`nitro(${nitroValueText})`);
  else parts.push('nitro()');
  const replacement = parts.join(`,\n${indent}`);

  const edits: Edit[] = [{ start: callStart, end: callEnd, text: replacement }];

  const importsToAdd: string[] = [];
  if (!angularImported) {
    importsToAdd.push(`import angular from '@analogjs/vite-plugin-angular';`);
  }
  if (!nitroImported) {
    importsToAdd.push(`import { nitro } from 'nitro/vite';`);
  }
  if (importsToAdd.length > 0) {
    edits.push({
      start: analogImportEnd,
      end: analogImportEnd,
      text: `\n${importsToAdd.join('\n')}`,
    });
  }

  const rewritten = applyEdits(source, edits);

  return {
    source: rewritten,
    movedVite: viteValueText !== null,
    movedNitro: nitroValueText !== null,
  };
}

export default function migrateToSeparatedPlugins(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const filesUsingLegacyShape: string[] = [];
    const rewrittenFiles: string[] = [];
    const unhandledFiles: string[] = [];

    tree.visit((filePath) => {
      if (filePath.includes('/node_modules/')) return;
      if (!isViteConfig(filePath)) return;

      const content = tree.read(filePath);
      if (!content) return;

      const source = content.toString('utf-8');
      if (!usesLegacyPluginShape(source)) return;

      filesUsingLegacyShape.push(filePath);

      const transformed = tryTransformViteConfig(filePath, source);
      if (transformed) {
        tree.overwrite(filePath, transformed.source);
        rewrittenFiles.push(filePath);
      } else {
        unhandledFiles.push(filePath);
      }
    });

    if (filesUsingLegacyShape.length === 0) {
      return tree;
    }

    if (rewrittenFiles.length > 0) {
      context.logger.info(
        `Rewrote ${rewrittenFiles.length} vite.config file(s) to the separated \`analog() + angular() + nitro()\` shape:`,
      );
      for (const file of rewrittenFiles) {
        context.logger.info(`  - ${file}`);
      }
      context.logger.info(
        `Review the result — only \`vite\` and \`nitro\` were moved automatically. Other angular-passthrough options (\`liveReload\`, \`fastCompile\`, \`fileReplacements\`, \`tailwindCss\`, etc.) still need to be relocated by hand.\nSee ${MIGRATION_DOC_URL}`,
      );
    }

    if (unhandledFiles.length > 0) {
      context.logger.info(
        `Could not safely rewrite ${unhandledFiles.length} vite.config file(s); migrate them by hand:`,
      );
      for (const file of unhandledFiles) {
        context.logger.info(`  - ${file}`);
      }
      context.logger.info(
        `Split \`analog()\` into \`analog() + angular() + nitro()\` and move each option to its owning plugin.\nSee ${MIGRATION_DOC_URL}`,
      );
    }

    addDependencies(tree, context);

    return tree;
  };
}
