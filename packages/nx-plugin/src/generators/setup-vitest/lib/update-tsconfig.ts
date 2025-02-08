import { Tree, getProjects, joinPathFragments, updateJson } from '@nx/devkit';

import { SetupVitestGeneratorSchema } from '../schema';

interface TsConfig {
  files: string[];
  compilerOptions: {
    module?: string;
    target?: string;
    types?: string[];
  };
}

export function updateTsConfig(tree: Tree, schema: SetupVitestGeneratorSchema) {
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
        json.files ??= ['src/test-setup.ts'];
        json.compilerOptions.types = (json.compilerOptions.types ?? ['node'])
          .filter((type) => type !== 'jest')
          .concat(['vitest/globals']);

        return json;
      },
      { expectComments: true, allowTrailingComma: true },
    );
  }
}
