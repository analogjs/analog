// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { lastValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { scheduleTarget } = require('nx/src/adapter/ngcli-adapter');

const project = {
  name: 'app',
  root: 'app',
  targets: {
    echo: {
      executor: 'echo-builder:echo',
      options: { message: 'from config' },
    },
  },
};

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value));
}

// A workspace with one Angular CLI builder that echoes its `message` option.
function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'nx-architect-host-'));
  const builderDir = join(root, 'node_modules/echo-builder');
  mkdirSync(builderDir, { recursive: true });
  mkdirSync(join(root, 'node_modules/@angular-devkit'));
  symlinkSync(
    dirname(require.resolve('@angular-devkit/architect/package.json')),
    join(root, 'node_modules/@angular-devkit/architect'),
    'junction',
  );
  writeJson(join(root, 'nx.json'), {});
  writeJson(join(builderDir, 'package.json'), {
    name: 'echo-builder',
    builders: './builders.json',
  });
  writeJson(join(builderDir, 'builders.json'), {
    builders: {
      echo: {
        implementation: './echo.js',
        schema: './schema.json',
        description: 'Echo the message option',
      },
    },
  });
  writeJson(join(builderDir, 'schema.json'), {
    type: 'object',
    properties: { message: { type: 'string' } },
  });
  writeFileSync(
    join(builderDir, 'echo.js'),
    `module.exports = require('@angular-devkit/architect').createBuilder(
      (options) => ({ success: true, message: options.message }),
    );`,
  );
  return root;
}

async function runEcho(root: string, runOptions: Record<string, unknown>) {
  const output = await scheduleTarget(
    root,
    {
      project: 'app',
      target: 'echo',
      configuration: undefined,
      runOptions,
      projects: { app: project },
    },
    false,
    {
      nodes: { app: { name: 'app', type: 'lib', data: project } },
      dependencies: {},
    },
  );
  return lastValueFrom(output);
}

describe('Nx running Angular CLI builders', () => {
  let root: string;

  beforeEach(() => {
    root = createWorkspace();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runs a builder target with the options from the project configuration', async () => {
    const result = await runEcho(root, {});

    expect(result.success).toBe(true);
    expect(result.message).toBe('from config');
  });

  it('applies run options over the configured options', async () => {
    const result = await runEcho(root, { message: 'from cli' });

    expect(result.message).toBe('from cli');
  });
});
