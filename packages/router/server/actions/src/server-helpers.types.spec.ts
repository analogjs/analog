// @vitest-environment node

import { resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('preserves schema inference in the built server actions entry point', () => {
  const filename = resolve(
    import.meta.dirname,
    '../../../../../typed-server-helpers-consumer.ts',
  );
  const source = `
    import { defineAction, defineApiRoute, json, type PageServerAction, type StandardSchemaV1 } from '@analogjs/router/server/actions';
    import { z } from 'zod';
    import type { H3Event } from 'h3';

    const countSchema: StandardSchemaV1<string, number> = z.string().transform(Number);

    defineAction({ schema: countSchema, handler: ({ data }) => {
      const count: number = data;
      return json({ count });
    } });

    const action: (context: PageServerAction) => Promise<Response> = defineAction({
      schema: z.object({ count: z.string().transform(Number) }),
      params: z.object({ id: z.string() }),
      handler: ({ data, params, event }) => {
        const count: number = data.count;
        const id: string = params.id;
        const request: H3Event = event;
        // @ts-expect-error The schema transforms count to a number.
        const invalid: string = data.count;
        // @ts-expect-error Unknown schema properties must not become any.
        data.missing;
        return json({ count, id });
      },
    });

    const api: (event: H3Event) => Promise<Response> = defineApiRoute({
      input: z.object({ enabled: z.boolean() }),
      params: z.object({ id: z.string().transform(Number) }),
      query: z.object({ tag: z.array(z.string()) }),
      body: z.object({ name: z.string() }),
      handler: ({ data, params, query, body }) => {
        const enabled: boolean = data.enabled;
        const id: number = params.id;
        const tags: string[] = query.tag;
        const name: string = body.name;
        // @ts-expect-error Params retain the schema output type.
        const invalid: string = params.id;
        // @ts-expect-error Body inference must not become any.
        body.missing;
        return { enabled, id, tags, name };
      },
    });
    defineAction({ handler: ({ data }) => {
      // @ts-expect-error Unvalidated body values are unknown.
      const count: number = data.count;
      return json({});
    } });
  `;
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: ['node'],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    path,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    path === filename
      ? ts.createSourceFile(path, source, languageVersion, true)
      : getSourceFile(
          path,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );
  const program = ts.createProgram([filename], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(
    diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    ),
  ).toEqual([]);
});
