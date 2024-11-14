import {
  BuilderContext,
  BuilderOutput,
  createBuilder,
} from '@angular-devkit/architect';
// @ts-ignore
import { buildApplicationInternal } from '@angular/build/private';
import { createAngularMemoryPlugin } from './plugins/angular-memory-plugin';
import { VitestSchema } from './schema';

const outputFiles = new Map();

async function vitestBuilder(
  options: VitestSchema,
  context: any
): Promise<BuilderOutput> {
  process.env['TEST'] = 'true';
  process.env['VITEST'] = 'true';

  const { startVitest } = await (Function(
    'return import("vitest/node")'
  )() as Promise<typeof import('vitest/node')>);

  const projectConfig = await context.getProjectMetadata(context.target);
  const extraArgs = await getExtraArgs(options);
  const config = {
    root: `${projectConfig['root'] || '.'}`,
    watch: options.watch === true,
    config: undefined,
    plugins: [
      createAngularMemoryPlugin({
        virtualProjectRoot: projectConfig['root'],
        outputFiles: new Map(),
      }),
      // {
      //   name: 'debug',
      //   transform(code, id) {
      //     // console.log({ id })
      //   }
      // }
    ],
    // test: {
    //   reporters: ['default'],
    //   globals: true,
    //   environment: 'jsdom',
    //   setupFiles: ['src/test-setup.ts'],
    //   include: ['**/*.spec.ts'],
    //   pool: 'vmThreads',
    //   server: {
    //     deps: {
    //       inline: ['@analogjs/router', '@analogjs/vitest-angular/setup-zone'],
    //     },
    //   },
    // },
    // define: {
    //   'import.meta.vitest': 'true',
    // },
    ...extraArgs,
  };

  for await (const result of buildApplicationInternal(
    {
      aot: false,
      index: false,
      progress: false,
      outputPath: 'dist',
      tsConfig: 'libs/card/tsconfig.spec.json',
      entryPoints: new Set(['libs/card/src/lib/card/card.component.spec.ts']),
      allowedCommonJsDependencies: ['@analogjs/vitest-angular/setup-zone'],
    },
    context
  )) {
    if (result.kind === 1) {
      Object.keys(result.files).forEach((key) => {
        console.log(result.files[key]);
        outputFiles.set(key, result.files[key].contents);
      });
    }
  }
  const server = await startVitest(
    'test',
    options.testFiles ?? ['libs/card/src/lib/card/card.component.spec.ts'],
    config
  );

  let hasErrors = false;

  const processExit = () => {
    // server?.exit();
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
