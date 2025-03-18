import { Tree, getProjects, joinPathFragments, updateJson } from '@nx/devkit';

import { SetupAnalogGeneratorSchema } from '../schema';

interface TsConfig {
  files: string[];
  compilerOptions: {
    module?: string;
    target?: string;
    types?: string[];
  };
}

export function updateTestTsConfig(
  tree: Tree,
  schema: SetupAnalogGeneratorSchema,
) {
  const projects = getProjects(tree);

  const projectConfig = projects.get(schema.project);

  const tsconfigPath = joinPathFragments(
    projectConfig.root,
    'tsconfig.spec.json',
  );

  if (tree.exists(tsconfigPath)) {
    updateJson<TsConfig>(
      tree,
      tsconfigPath,
      (json) => {
        json.compilerOptions ??= {};
        json.compilerOptions.module = undefined;
        json.compilerOptions.target ??= 'es2016';
        json.compilerOptions.types = ['vitest/globals', 'node'];
        json.files = ['src/test-setup.ts'];

        return json;
      },
      { expectComments: true, allowTrailingComma: true },
    );
  }
}
