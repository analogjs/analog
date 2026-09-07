import { createHash } from 'node:crypto';
import { parseSync } from 'oxc-parser';
import type { RegistryEntry } from './registry.js';

/** Fingerprint everything except proven literal component template/style metadata. */
export function componentHmrSignature(
  code: string,
  file: string,
): string | undefined {
  try {
    const { program, errors } = parseSync(file, code);
    if (errors.length) return;
    const components = new Set<string>();
    for (const node of program.body) {
      if (
        node.type !== 'ImportDeclaration' ||
        node.source.value !== '@angular/core'
      )
        continue;
      for (const specifier of node.specifiers) {
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === 'Component'
        )
          components.add(specifier.local.name);
      }
    }
    const resources = new Set<object>();
    let found = false;
    for (const node of program.body) {
      const declaration =
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportDefaultDeclaration'
          ? node.declaration
          : node;
      if (declaration?.type !== 'ClassDeclaration') continue;
      for (const decorator of declaration.decorators ?? []) {
        const call = decorator.expression;
        if (
          call.type !== 'CallExpression' ||
          call.callee.type !== 'Identifier' ||
          !components.has(call.callee.name)
        )
          return;
        const metadata = call.arguments[0];
        if (
          call.arguments.length !== 1 ||
          metadata?.type !== 'ObjectExpression'
        )
          return;
        found = true;
        for (const property of metadata.properties) {
          if (
            property.type !== 'Property' ||
            property.computed ||
            property.method ||
            property.shorthand
          )
            return;
          const key =
            property.key.type === 'Identifier'
              ? property.key.name
              : property.key.type === 'Literal'
                ? property.key.value
                : undefined;
          if (
            ![
              'template',
              'templateUrl',
              'styles',
              'styleUrl',
              'styleUrls',
            ].includes(String(key))
          )
            continue;
          const literal = (value: typeof property.value): boolean =>
            (value.type === 'Literal' && typeof value.value === 'string') ||
            (value.type === 'TemplateLiteral' &&
              value.expressions.length === 0);
          const value = property.value;
          if (
            !literal(value) &&
            !(
              value.type === 'ArrayExpression' &&
              value.elements.every(
                (element) =>
                  element !== null &&
                  element.type !== 'SpreadElement' &&
                  literal(element),
              )
            )
          )
            return;
          resources.add(property);
        }
      }
    }
    if (!found) return;
    return createHash('sha256')
      .update(
        JSON.stringify(program, (key, value) => {
          if (['start', 'end', 'loc', 'raw'].includes(key)) return undefined;
          if (typeof value === 'bigint') return String(value);
          return Array.isArray(value)
            ? value.filter((item) => !resources.has(item))
            : value;
        }),
      )
      .digest('hex');
  } catch {
    return undefined;
  }
}

export function generateHmrCode(
  declarations: RegistryEntry[],
  localDepClassNames: string[] = [],
  signature?: string,
  rendererCache = false,
): string {
  const components = declarations.filter((d) => d.kind === 'component');
  const nonComponents = declarations.filter((d) => d.kind !== 'component');

  // Export applyMetadata functions so the accept callback can access them.
  // Dynamically copy all ɵ-prefixed static fields to handle ɵcmp, ɵfac,
  // ɵdir, ɵpipe, ɵmod, ɵinj, ɵprov, and any future Ivy fields.
  const applyFns = components
    .map(
      (c) => `
export function ɵhmr_${c.className}(type) {
  for (const key of Object.getOwnPropertyNames(${c.className})) {
    if (key.startsWith('ɵ')) type[key] = ${c.className}[key];
  }
  // Definitions and factories must keep targeting the original live class.
  if (type.ɵcmp) type.ɵcmp.type = type;
  if (type.ɵfac) type.ɵfac = (target) => ${c.className}.ɵfac(target ?? type);
}`,
    )
    .join('\n');

  // Components: use ɵɵreplaceMetadata for full LView recreation
  const localDepsArray =
    localDepClassNames.length > 0 ? `[${localDepClassNames.join(', ')}]` : '[]';

  const replaceBlocks = components
    .map(
      (c) => `
      try {
        ${rendererCache ? '__analogReplaceMetadata(i0.ɵɵreplaceMetadata,' : 'i0.ɵɵreplaceMetadata('}
          ɵhmrClasses.get('${c.className}'),
          newModule.ɵhmr_${c.className},
          { i0 },
          ${localDepsArray},
          import.meta,
          "${c.className}"
        );
        replaced = true;
      } catch(e) {
        import.meta.hot.invalidate('Component HMR failed, reloading');
        return;
      }`,
    )
    .join('\n');

  let acceptBody = `
    if (!newModule) return;`;
  if (nonComponents.length > 0) {
    acceptBody += `
    import.meta.hot.invalidate('Directive/pipe changed, reloading');`;
  } else {
    acceptBody += `
    if (!ɵhmrSignature || newModule.ɵhmrSignature !== ɵhmrSignature) {
      import.meta.hot.invalidate('Component behavior changed, reloading');
      return;
    }
    let replaced = false;${replaceBlocks}
    if (!replaced) import.meta.hot.invalidate('Component HMR failed, reloading');`;
  }

  return `\n${rendererCache ? "import { replaceMetadata as __analogReplaceMetadata } from 'virtual:analog-component-style-hmr';\n" : ''}export const ɵhmrSignature = ${JSON.stringify(signature ?? null)};\n${applyFns}
if (import.meta.hot) {
  // Later module evaluations must update the class Angular first instantiated.
  // The newly imported class is only a metadata donor, never the live target.
  const ɵhmrClasses = import.meta.hot.data.analogClasses ??= new Map();
  ${declarations.map((c) => `if (!ɵhmrClasses.has('${c.className}')) ɵhmrClasses.set('${c.className}', ${c.className});`).join('\n  ')}
  import.meta.hot.accept((newModule) => {${acceptBody}
  });
}`;
}
