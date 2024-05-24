import {
  BuilderContext,
  BuilderOutput,
  createBuilder,
} from '@angular-devkit/architect';

import { VitestSchema } from './schema';

async function vitestBuilder(
  options: VitestSchema,
  context: BuilderContext
): Promise<BuilderOutput> {
  process.env['TEST'] = 'true';
  process.env['VITEST'] = 'true';

  const { startVitest } = await (Function(
    'return import("vitest/node")'
  )() as Promise<typeof import('vitest/node')>);

  const projectConfig = await context.getProjectMetadata(
    context.target as unknown as string
  );
  const extraArgs = await getExtraArgs(options);
  const config = {
    root: `${projectConfig['root'] || '.'}`,
    watch: options.watch === true,
    ...extraArgs,
  };

  const server = await startVitest('test', options.testFiles ?? [], config);

  let hasErrors = false;

  const processExit = () => {
    server?.exit();
    if (hasErrors) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  };

  if (options.watch) {
    process.on('SIGINT', processExit);
    process.on('SIGTERM', processExit);
    process.on('exit', processExit);
  }

  // vitest sets the exitCode = 1 when code coverage isn't met
  hasErrors = (process.exitCode && process.exitCode !== 0) as boolean;

  return {
    success: !hasErrors,
  };
}

export async function getExtraArgs(
  options: VitestSchema
): Promise<Record<string, any>> {
  // support passing extra args to Vitest CLI
  const schema = await import('./schema.json');
  const extraArgs: Record<string, any> = {};
  for (const key of Object.keys(options)) {
    if (!(schema as any).properties[key]) {
      extraArgs[key] = (options as any)[key];
    }
  }

  return extraArgs;
}

export default createBuilder(vitestBuilder) as any;
