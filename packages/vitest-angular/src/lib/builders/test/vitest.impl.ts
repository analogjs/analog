import {
  BuilderContext,
  BuilderOutput,
  createBuilder,
} from '@angular-devkit/architect';

import { VitestSchema } from './schema';
import { resolve } from 'node:path';

async function vitestBuilder(
  options: VitestSchema,
  context: BuilderContext,
): Promise<BuilderOutput> {
  process.env['TEST'] = 'true';
  process.env['VITEST'] = 'true';

  const { startVitest } = await (Function(
    'return import("vitest/node")',
  )() as Promise<typeof import('vitest/node')>);

  const projectConfig = await context.getProjectMetadata(
    context.target as unknown as string,
  );
  const projectRoot = projectConfig['root'] ?? '.';
  if (typeof projectRoot !== 'string') {
    throw new Error('The Angular project root must be a string.');
  }
  const { coverageArgs, ...extraArgs } = await getExtraArgs(options);
  const watch = options.watch === true;
  const ui = options.ui === true;
  const coverageEnabled = options.coverage === true;
  const update = options.update === true;
  const config = {
    root: resolve(context.workspaceRoot, projectRoot),
    watch,
    ui,
    config: options.configFile
      ? resolve(context.workspaceRoot, options.configFile)
      : undefined,
    coverage: {
      enabled: coverageEnabled,
      ...coverageArgs,
    },
    update,
    ...extraArgs,
  };
  const viteOverrides: any = {
    root: config.root,
    test: { watch },
  };

  const server = await startVitest(
    'test',
    options.testFiles ?? [],
    config,
    viteOverrides,
  );

  let hasErrors = false;

  const processExit = () => {
    server?.exit();
    if (hasErrors) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  };

  // .once() prevents listener stacking across repeated Nx executor runs
  // that share the same host process (avoids MaxListenersExceededWarning).
  if (options.watch) {
    process.once('SIGINT', processExit);
    process.once('SIGTERM', processExit);
    process.once('exit', processExit);
  }

  // vitest sets the exitCode = 1 when code coverage isn't met
  hasErrors = (process.exitCode && process.exitCode !== 0) as boolean;

  return {
    success: !hasErrors,
  };
}

export async function getExtraArgs(
  options: VitestSchema,
): Promise<Record<string, any>> {
  // support passing extra args to Vitest CLI
  const schema = await import('./schema.json', { with: { type: 'json' } });
  const extraArgs: Record<string, any> = {};
  for (const key of Object.keys(options)) {
    if (!(schema as any).default.properties[key]) {
      extraArgs[key] = (options as any)[key];
    }
  }

  return extraArgs;
}

export default createBuilder(vitestBuilder) as any;
