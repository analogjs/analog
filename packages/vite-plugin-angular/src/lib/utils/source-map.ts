import { Schema } from 'effect';
import { dirname, isAbsolute, resolve } from 'node:path';
import { normalizePath } from 'vite';

const SourceMap = Schema.Struct({
  version: Schema.Literal(3),
  sources: Schema.Array(Schema.String),
  sourceRoot: Schema.optionalKey(Schema.String),
  mappings: Schema.String,
});
const decodeSourceMap = Schema.decodeUnknownSync(
  Schema.fromJsonString(SourceMap),
);
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** Absolute sources keep Vite from composing an emitted map with itself. */
export function normalizeSourceMap(map: string, id: string): string {
  const parsed = decodeSourceMap(map, { onExcessProperty: 'preserve' });
  const { sourceRoot = '', ...rest } = parsed;
  return JSON.stringify({
    ...rest,
    sources: parsed.sources.map((source) => {
      if (isAbsolute(source)) return normalizePath(source);
      if (URI_SCHEME.test(source)) return source;
      if (URI_SCHEME.test(sourceRoot))
        return new URL(
          source,
          sourceRoot.endsWith('/') ? sourceRoot : `${sourceRoot}/`,
        ).href;
      return normalizePath(resolve(dirname(id), sourceRoot, source));
    }),
  });
}

/** Angular's linker and Compilation API attach their maps as final comments. */
export function extractInlineSourceMap(code: string): {
  code: string;
  map: string | null;
} {
  const match = code.match(
    /\n?\/\/# sourceMappingURL=data:application\/json(?:;charset=[^;,\r\n]+)?;base64,([A-Za-z0-9+/=]+)\s*$/,
  );
  const encoded = match?.[1];
  if (encoded === undefined || match?.index === undefined)
    return { code, map: null };
  return {
    code: code.slice(0, match.index),
    map: Buffer.from(encoded, 'base64').toString('utf8'),
  };
}
