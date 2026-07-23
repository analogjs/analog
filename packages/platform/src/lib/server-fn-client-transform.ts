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
        toProxy(declarator.id.name, declarator.init.arguments ?? [], fileId),
      );
    }
  }

  // Every `serverFn(...)` call in the module must have become a proxy. If one
  // did not, the module uses a shape this transform cannot rewrite (e.g.
  // `const fn = serverFn(...); export { fn };`) and returning `null` would leave
  // it untouched — shipping the handler and its server imports to the browser.
  // Fail the build instead: a scrub that silently opts out is a code leak.
  const callCount = countServerFnCalls(program, serverFnLocalNames);
  if (callCount > proxies.length) {
    throw new Error(
      `[analog] ${fileId}: found ${callCount} serverFn call(s) but could only rewrite ${proxies.length} for the client build. ` +
        `Server functions must be declared as a directly exported const — \`export const name = serverFn(…)\` — so the handler can be stripped from the browser bundle.`,
    );
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

function toProxy(name: string, args: any[], fileId: string): ServerFnProxy {
  const method = methodForCall(name, args, fileId);
  // The id is derived, never read from source — same algorithm the server
  // registration uses, so client proxy and server route always match.
  return { name, id: deriveServerFnId(fileId, name), method };
}

/**
 * Resolve the HTTP method from the call shape, matching the runtime overloads:
 * `serverFn(handler)` ⇒ GET, `serverFn(schema, handler)` ⇒ POST,
 * `serverFn(config, handler)` ⇒ config-driven.
 */
function methodForCall(
  name: string,
  args: any[],
  fileId: string,
): 'GET' | 'POST' {
  const arg0 = args[0];

  // serverFn(handler) — input-less GET.
  if (isFunctionNode(arg0)) return 'GET';

  // serverFn(config, handler) — read method/input off the object.
  if (arg0?.type === 'ObjectExpression') {
    let method: 'GET' | 'POST' | undefined;
    let hasInput = false;
    for (const prop of arg0.properties ?? []) {
      if (prop.type !== 'Property') continue;
      const key =
        prop.key?.type === 'Identifier' ? prop.key.name : prop.key?.value;
      if (key === 'method' && isStringLiteral(prop.value)) {
        method = prop.value.value as 'GET' | 'POST';
      } else if (key === 'input') {
        hasInput = true;
      }
    }
    if (method === 'GET' && hasInput) {
      throw new Error(
        `[analog] serverFn "${name}" in ${fileId} declares method: 'GET' with an input schema; GET carries no body. Use POST or drop the input.`,
      );
    }
    return method ?? (hasInput ? 'POST' : 'GET');
  }

  // serverFn(schema, handler) — a schema ⇒ POST + input.
  if (arg0 && args.length >= 2) return 'POST';

  throw new Error(
    `[analog] serverFn "${name}" in ${fileId} must be called as serverFn(handler), serverFn(schema, handler), or serverFn(config, handler).`,
  );
}

function isFunctionNode(node: any): boolean {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  );
}

function isStringLiteral(
  node: any,
): node is { type: 'Literal'; value: string } {
  return node?.type === 'Literal' && typeof node.value === 'string';
}

/** Every `serverFn(...)` call anywhere in the module, not just exported ones. */
function countServerFnCalls(node: unknown, names: Set<string>): number {
  if (!node || typeof node !== 'object') {
    return 0;
  }
  if (Array.isArray(node)) {
    return node.reduce(
      (total, child) => total + countServerFnCalls(child, names),
      0,
    );
  }

  const record = node as Record<string, unknown> & { type?: string };
  let count = 0;
  if (record.type === 'CallExpression') {
    const callee = record['callee'] as { type?: string; name?: string };
    if (
      callee?.type === 'Identifier' &&
      callee.name &&
      names.has(callee.name)
    ) {
      count += 1;
    }
  }
  for (const key of Object.keys(record)) {
    count += countServerFnCalls(record[key], names);
  }
  return count;
}
