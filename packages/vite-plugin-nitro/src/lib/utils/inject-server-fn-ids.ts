import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';

import { deriveServerFnId } from './derive-server-fn-id.js';

const SERVER_FN_SOURCE = '@analogjs/router/server';

export interface InjectServerFnIdsResult {
  code: string;
  ids: { name: string; id: string }[];
}

/**
 * Server/SSR-build transform: injects the derived `id` into each
 * `export const NAME = serverFn(config, handler)` so the function registers
 * under the same opaque id the client proxy dispatches to. Unlike the client
 * scrub this keeps the handler and every other statement intact — it only edits
 * the config object — so the server module still runs the real implementation.
 *
 * Returns `null` when the module defines no server function.
 */
export function injectServerFnIds(
  code: string,
  fileId: string,
): InjectServerFnIdsResult | null {
  if (!code.includes('serverFn')) {
    return null;
  }

  const { program } = parseSync(fileId, code);
  const body = (program as { body: any[] }).body;
  const serverFnLocalNames = collectServerFnLocalNames(body);

  const magic = new MagicString(code);
  const ids: { name: string; id: string }[] = [];

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

      const name = declarator.id.name;
      const id = deriveServerFnId(fileId, name);
      ids.push({ name, id });

      const configArg = declarator.init.arguments?.[0];
      if (configArg?.type !== 'ObjectExpression') {
        throw new Error(
          `[analog] serverFn "${name}" in ${fileId} must be called with an inline config object.`,
        );
      }
      injectId(magic, configArg, id);
    }
  }

  if (ids.length === 0) {
    return null;
  }

  return { code: magic.toString(), ids };
}

/**
 * Insert (or replace) `id: "<derived>"` in the config object. Authors do not
 * supply an id; a stray one is overwritten so the route is always the derived,
 * non-enumerable digest — never an author-controlled value.
 */
function injectId(magic: MagicString, configArg: any, id: string): void {
  const existing = (configArg.properties ?? []).find(
    (prop: any) =>
      prop.type === 'Property' &&
      (prop.key?.type === 'Identifier' ? prop.key.name : prop.key?.value) ===
        'id',
  );

  if (existing) {
    magic.overwrite(
      existing.value.start,
      existing.value.end,
      JSON.stringify(id),
    );
    return;
  }

  // Insert as the first property, right after the opening brace.
  magic.appendRight(configArg.start + 1, ` id: ${JSON.stringify(id)},`);
}

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
  if (names.size === 0) {
    names.add('serverFn');
  }
  return names;
}
