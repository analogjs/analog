import { parseSync } from 'oxc-parser';
// Light subpath (no vite/nitro barrel): the built scrub is loaded outside a
// build too, so it must not pull the plugin graph in.
import { deriveServerFnId } from '@analogjs/vite-plugin-nitro/server-fn-id';

/**
 * Client-build scrub + proxy generation for server functions.
 *
 * On the client build a `*.server.ts` module must not carry server handler
 * bodies (which `inject()` server services, read the request, hit the database).
 * But the client still imports the named `serverFn` exports to dispatch them.
 * This transform regenerates the module so each `export const NAME = serverFn(
 * config, handler)` becomes a call to the client-safe `createServerFnRef`
 * factory — keeping the `{ id, url, method }` metadata `injectServerFn` needs,
 * dropping the handler and every server-only import. Because the regenerated
 * module references nothing else, the server code tree-shakes away entirely.
 *
 * Returns the new module source, or `null` when the module defines no server
 * function (the caller falls back to the page-endpoint scrub for those).
 */
export interface ServerFnProxy {
  name: string;
  id: string;
  method: 'GET' | 'POST';
}

export interface ScrubResult {
  code: string;
  proxies: ServerFnProxy[];
  hadDefaultExport: boolean;
}

const SERVER_FN_SOURCE = '@analogjs/router/server';

export function scrubServerFnModule(
  code: string,
  fileId = 'file.ts',
): ScrubResult | null {
  // Cheap bail-out before parsing: no `serverFn` token, nothing to do.
  if (!code.includes('serverFn')) {
    return null;
  }

  const { program } = parseSync(fileId, code);
  const body = (program as { body: any[] }).body;

  const serverFnLocalNames = collectServerFnLocalNames(body);
  const hadDefaultExport = body.some(
    (node) => node.type === 'ExportDefaultDeclaration',
  );

  const proxies: ServerFnProxy[] = [];
  for (const node of body) {
    if (
      node.type !== 'ExportNamedDeclaration' ||
      node.declaration?.type !== 'VariableDeclaration'
    ) {
      continue;
    }
    for (const declarator of node.declaration.declarations) {
      if (
        declarator.id?.type !== 'Identifier' ||
        declarator.init?.type !== 'CallExpression' ||
        declarator.init.callee?.type !== 'Identifier' ||
        !serverFnLocalNames.has(declarator.init.callee.name)
      ) {
        continue;
      }
      proxies.push(
        toProxy(declarator.id.name, declarator.init.arguments?.[0], fileId),
      );
    }
  }

  if (proxies.length === 0) {
    return null;
  }

  const lines = [
    `import { createServerFnRef } from '@analogjs/router';`,
    '',
    ...proxies.map(
      (p) =>
        `export const ${p.name} = createServerFnRef({ id: ${JSON.stringify(
          p.id,
        )}, method: ${JSON.stringify(p.method)} });`,
    ),
  ];
  // A file that is also a page endpoint keeps the load-shim the router expects.
  if (hadDefaultExport) {
    lines.push('', 'export default undefined;');
  }

  return { code: lines.join('\n') + '\n', proxies, hadDefaultExport };
}

/** Local identifier(s) `serverFn` is imported under from `@analogjs/router/server`. */
function collectServerFnLocalNames(body: any[]): Set<string> {
  const names = new Set<string>();
  for (const node of body) {
    if (
      node.type !== 'ImportDeclaration' ||
      node.source?.value !== SERVER_FN_SOURCE
    ) {
      continue;
    }
    for (const spec of node.specifiers ?? []) {
      if (
        spec.type === 'ImportSpecifier' &&
        spec.imported?.name === 'serverFn'
      ) {
        names.add(spec.local.name);
      }
    }
  }
  // Fallback: if the module never imported it (unusual), still match the
  // conventional name so a mis-resolved import doesn't leak server code.
  if (names.size === 0) {
    names.add('serverFn');
  }
  return names;
}

function toProxy(name: string, configArg: any, fileId: string): ServerFnProxy {
  if (configArg?.type !== 'ObjectExpression') {
    throw new Error(
      `[analog] serverFn "${name}" in ${fileId} must be called with an inline config object so the client proxy can be generated.`,
    );
  }

  let method: 'GET' | 'POST' | undefined;
  let hasInput = false;

  for (const prop of configArg.properties ?? []) {
    if (prop.type !== 'Property') continue;
    const key =
      prop.key?.type === 'Identifier' ? prop.key.name : prop.key?.value;
    if (key === 'method' && isStringLiteral(prop.value)) {
      method = prop.value.value as 'GET' | 'POST';
    } else if (key === 'input') {
      hasInput = true;
    }
  }

  // GET carries no body, so it can never receive validated input — reject at
  // build time rather than silently dropping the input on the client.
  if (method === 'GET' && hasInput) {
    throw new Error(
      `[analog] serverFn "${name}" in ${fileId} declares method: 'GET' with an input schema; GET carries no body. Use POST or drop the input.`,
    );
  }

  // The id is derived, never read from source — same algorithm the server
  // registration uses, so client proxy and server route always match.
  return {
    name,
    id: deriveServerFnId(fileId, name),
    method: method ?? (hasInput ? 'POST' : 'GET'),
  };
}

function isStringLiteral(
  node: any,
): node is { type: 'Literal'; value: string } {
  return node?.type === 'Literal' && typeof node.value === 'string';
}
