import { parseSync } from 'oxc-parser';

/**
 * Source transforms for the migrate-angular-ssr schematic, written
 * against the stock `ng new --ssr` scaffold. Each returns the migrated
 * source, the input unchanged when already migrated, or null when the
 * expected pattern is missing — the schematic surfaces the manual step
 * instead of guessing at a diverged file.
 */

interface Edit {
  start: number;
  end: number;
  text: string;
}

type AstNode = { type: string; start: number; end: number } & Record<
  string,
  any
>;

function applyEdits(code: string, edits: Edit[]): string {
  let out = code;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, visit);
    }
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record['type'] === 'string') {
    visit(record as AstNode);
  }
  for (const key of Object.keys(record)) {
    walk(record[key], visit);
  }
}

function findImport(program: AstNode, source: string): AstNode | undefined {
  return (program['body'] as AstNode[]).find(
    (node) =>
      node.type === 'ImportDeclaration' && node['source']?.value === source,
  );
}

/**
 * Removes named specifiers from an import, rewriting the whole
 * statement — or removing it, trailing newline included, when nothing
 * is left.
 */
function removeFromImport(
  code: string,
  importNode: AstNode,
  names: string[],
): Edit {
  const keep = (importNode['specifiers'] as AstNode[]).filter(
    (specifier) =>
      !(
        specifier.type === 'ImportSpecifier' &&
        names.includes(specifier['imported']?.name)
      ),
  );
  if (keep.length === 0) {
    const end = importNode.end + (code[importNode.end] === '\n' ? 1 : 0);
    return { start: importNode.start, end, text: '' };
  }
  const named = keep
    .filter((specifier) => specifier.type === 'ImportSpecifier')
    .map((specifier) => code.slice(specifier.start, specifier.end));
  const defaultSpecifier = keep.find(
    (specifier) => specifier.type === 'ImportDefaultSpecifier',
  );
  const clauses = [
    ...(defaultSpecifier ? [defaultSpecifier['local'].name] : []),
    ...(named.length ? [`{ ${named.join(', ')} }`] : []),
  ];
  return {
    start: importNode.start,
    end: importNode.end,
    text: `import ${clauses.join(', ')} from '${importNode['source'].value}';`,
  };
}

function insertImports(code: string, statements: string[]): string {
  if (!statements.length) {
    return code;
  }
  const { program } = parseSync('file.ts', code);
  const imports = (program as unknown as AstNode)['body'].filter(
    (node: AstNode) => node.type === 'ImportDeclaration',
  );
  const text = statements.join('\n');
  if (!imports.length) {
    return `${text}\n${code}`;
  }
  const at = Math.max(...imports.map((node: AstNode) => node.end));
  return `${code.slice(0, at)}\n${text}${code.slice(at)}`;
}

/**
 * app.config.ts: `provideRouter(routes, ...features)` becomes
 * `provideFileRouter(withExtraRoutes(routes), ...features)`, with the
 * imports moved to `@analogjs/router`.
 */
export function transformAppConfig(code: string): string | null {
  if (code.includes('provideFileRouter')) {
    return code;
  }
  const { program } = parseSync('app.config.ts', code);
  let call: AstNode | undefined;
  walk(program, (node) => {
    if (
      !call &&
      node.type === 'CallExpression' &&
      node['callee']?.type === 'Identifier' &&
      node['callee'].name === 'provideRouter'
    ) {
      call = node;
    }
  });
  if (!call) {
    return null;
  }

  const edits: Edit[] = [
    {
      start: call['callee'].start,
      end: call['callee'].end,
      text: 'provideFileRouter',
    },
  ];
  const imported = ['provideFileRouter'];
  const routesArg = call['arguments']?.[0];
  if (routesArg) {
    edits.push(
      {
        start: routesArg.start,
        end: routesArg.start,
        text: 'withExtraRoutes(',
      },
      { start: routesArg.end, end: routesArg.end, text: ')' },
    );
    imported.push('withExtraRoutes');
  }
  const routerImport = findImport(
    program as unknown as AstNode,
    '@angular/router',
  );
  if (routerImport) {
    edits.push(removeFromImport(code, routerImport, ['provideRouter']));
  }
  return insertImports(applyEdits(code, edits), [
    `import { ${imported.join(', ')} } from '@analogjs/router';`,
  ]);
}

/**
 * app.config.server.ts: `provideServerRendering(withRoutes(...))`
 * becomes `provideAnalogServerRendering(withRoutes(...))`, imported
 * from `@analogjs/router/ssr` — which derives the file-based server
 * routes and takes explicit ones through its own `withRoutes` feature.
 */
export function transformServerConfig(code: string): string | null {
  if (code.includes('provideAnalogServerRendering')) {
    return code;
  }
  const { program } = parseSync('app.config.server.ts', code);
  const calls: AstNode[] = [];
  walk(program, (node) => {
    if (
      node.type === 'CallExpression' &&
      node['callee']?.type === 'Identifier' &&
      node['callee'].name === 'provideServerRendering'
    ) {
      calls.push(node);
    }
  });
  if (!calls.length) {
    return null;
  }

  const edits: Edit[] = calls.map((call) => ({
    start: call['callee'].start,
    end: call['callee'].end,
    text: 'provideAnalogServerRendering',
  }));
  const imported = ['provideAnalogServerRendering'];
  const ssrImport = findImport(program as unknown as AstNode, '@angular/ssr');
  if (ssrImport) {
    const removed = ['provideServerRendering'];
    const hasWithRoutes = (ssrImport['specifiers'] as AstNode[]).some(
      (specifier) =>
        specifier.type === 'ImportSpecifier' &&
        specifier['imported']?.name === 'withRoutes',
    );
    if (hasWithRoutes) {
      removed.push('withRoutes');
      imported.push('withRoutes');
    }
    edits.push(removeFromImport(code, ssrImport, removed));
  }
  return insertImports(applyEdits(code, edits), [
    `import { ${imported.join(', ')} } from '@analogjs/router/ssr';`,
  ]);
}

/**
 * server.ts: mounts `createAnalogRequestHandler({ config })` ahead of
 * the scaffold's `express.static` layer. The insertion point is the
 * static-files `app.use`, extended back over its leading comment.
 */
export function transformServerEntry(
  code: string,
  configImportPath: string,
): string | null {
  if (code.includes('createAnalogRequestHandler')) {
    return code;
  }
  const { program, comments } = parseSync('server.ts', code);
  let statement: AstNode | undefined;
  walk(program, (node) => {
    if (
      !statement &&
      node.type === 'ExpressionStatement' &&
      node['expression']?.type === 'CallExpression' &&
      node['expression'].callee?.type === 'MemberExpression' &&
      node['expression'].callee.property?.name === 'use' &&
      node['expression'].arguments?.[0]?.type === 'CallExpression' &&
      node['expression'].arguments[0].callee?.type === 'MemberExpression' &&
      node['expression'].arguments[0].callee.property?.name === 'static'
    ) {
      statement = node;
    }
  });
  if (!statement) {
    return null;
  }

  // Insert above the statement's leading comment block, not between
  // the comment and the statement it documents.
  let at = statement.start;
  for (const comment of [...(comments ?? [])].sort(
    (a, b) => b.end - a.end,
  ) as AstNode[]) {
    if (comment.end <= at && code.slice(comment.end, at).trim() === '') {
      at = comment.start;
    }
  }
  at = code.lastIndexOf('\n', at) + 1;

  const receiver =
    statement['expression'].callee.object?.type === 'Identifier'
      ? statement['expression'].callee.object.name
      : 'app';
  const mounted = applyEdits(code, [
    {
      start: at,
      end: at,
      text: `/**
 * Analog's server surface: global middleware, server functions, page
 * endpoints, and API routes. Everything else falls through to the
 * layers below.
 */
${receiver}.use(createAnalogRequestHandler({ config }));

`,
    },
  ]);

  const hasConfig = (() => {
    let found = false;
    for (const node of (program as unknown as AstNode)['body'] as AstNode[]) {
      if (node.type === 'ImportDeclaration') {
        found ||= (node['specifiers'] as AstNode[]).some(
          (specifier) => specifier['local']?.name === 'config',
        );
      } else if (node.type === 'VariableDeclaration') {
        found ||= (node['declarations'] as AstNode[]).some(
          (declarator) => declarator['id']?.name === 'config',
        );
      }
    }
    return found;
  })();

  return insertImports(mounted, [
    `import { createAnalogRequestHandler } from '@analogjs/router/ssr';`,
    ...(hasConfig ? [] : [`import { config } from '${configImportPath}';`]),
  ]);
}
