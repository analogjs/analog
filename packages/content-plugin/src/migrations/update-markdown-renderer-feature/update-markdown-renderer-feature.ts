import {
  addDependenciesToPackageJson,
  formatFiles,
  installPackagesTask,
  Tree,
  visitNotIgnoredFiles,
} from '@nx/devkit';
import MagicString from 'magic-string';

export default async function update(
  host: Tree,
): Promise<(() => void) | undefined> {
  // oxc-parser is ESM-only; dynamic import for CJS compatibility
  const { parseSync, Visitor } = await import('oxc-parser');

  visitNotIgnoredFiles(host, '/', (file) => {
    if (file.endsWith('.ts')) {
      const content = host.read(file, 'utf-8');
      if (
        content &&
        content.includes('provideContent') &&
        content.includes('withMarkdownRenderer') &&
        !content.includes('withPrismHighlighter') &&
        !content.includes('withShikiHighlighter')
      ) {
        const result = parseSync(file, content, {
          lang: 'ts',
          sourceType: 'module',
        });

        if (result.errors.length > 0) return;

        // Find the provideContent(...withMarkdownRenderer...) call
        let lastArgEnd: number | undefined;
        let callEnd: number | undefined;

        const visitor = new Visitor({
          CallExpression(node) {
            if (
              node.callee.type === 'Identifier' &&
              node.callee.name === 'provideContent'
            ) {
              const hasRenderer = node.arguments.some(
                (arg) =>
                  arg.type === 'CallExpression' &&
                  arg.callee.type === 'Identifier' &&
                  arg.callee.name === 'withMarkdownRenderer',
              );
              if (hasRenderer) {
                const last = node.arguments[node.arguments.length - 1];
                lastArgEnd = last.end;
                callEnd = node.end - 1;
              }
            }
          },
        });
        visitor.visit(result.program);

        if (lastArgEnd === undefined || callEnd === undefined) return;

        const s = new MagicString(content);

        // Insert import after the last existing import statement
        const imports = result.module.staticImports;
        const lastImport = imports[imports.length - 1];
        const importInsertPos = lastImport ? lastImport.end : 0;
        s.appendRight(
          importInsertPos,
          `\nimport { withPrismHighlighter } from '@analogjs/content/prism-highlighter';`,
        );

        // Append withPrismHighlighter() after the last argument,
        // accounting for possible trailing comma
        const between = content.slice(lastArgEnd, callEnd);
        const commaOffset = between.indexOf(',');
        if (commaOffset !== -1) {
          // Insert after the trailing comma
          s.appendRight(
            lastArgEnd + commaOffset + 1,
            ' withPrismHighlighter()',
          );
        } else {
          s.appendLeft(lastArgEnd, ', withPrismHighlighter()');
        }

        host.write(file, s.toString());
      }
    }
  });

  // NOTE: we only add the dependency if the project is an Angular project
  //  Nx projects can add the dependency from migrations.json
  let dependencyAdded = false;
  if (host.exists('/angular.json')) {
    addDependenciesToPackageJson(host, { 'marked-mangle': '^1.1.7' }, {});
    dependencyAdded = true;
  }

  await formatFiles(host);

  if (dependencyAdded) {
    return () => installPackagesTask(host);
  }
}
