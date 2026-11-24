// @vitest-environment node

import { resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('excludes Response from the serverFn result type in the built entry points', () => {
  const filename = resolve(
    import.meta.dirname,
    '../../../typed-server-fn-consumer.ts',
  );
  const source = `
    import { injectServerFn, injectServerFnMutation } from '@analogjs/router';
    import { serverFn } from '@analogjs/router/server';
    import { fail, redirect } from '@analogjs/router/server/actions';
    import { z } from 'zod';

    const placeOrder = serverFn(z.object({ ok: z.boolean() }), async ({ ok }) => {
      if (!ok) return fail(409, { reason: 'conflict' });
      return { orderId: '1' };
    });
    const listOrders = serverFn(() => {
      if (Math.random() > 0.5) return redirect('/login');
      return [{ orderId: '1' }];
    });

    export async function call() {
      const { orderId } = await placeOrder({ ok: true });
      const id: string = orderId;
      const [first] = await listOrders();
      const firstId: string = first.orderId;
      const order: { orderId: string } = await injectServerFnMutation(placeOrder)({ ok: true });
      const orders: { orderId: string }[] | undefined = injectServerFn(listOrders).value();
      return { id, firstId, order, orders };
    }
  `;
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
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
}, 30_000);
