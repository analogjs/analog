import { Tree, getProjects, joinPathFragments, updateJson } from '@nx/devkit';

import { SetupAnalogGeneratorSchema } from '../schema';

interface TsConfig {
  files: string[];
  include: string[];
}

export function updateAppTsConfig(
  tree: Tree,
  schema: SetupAnalogGeneratorSchema,
) {
  const projects = getProjects(tree);

  const projectConfig = projects.get(schema.project);

  const tsconfigPath = joinPathFragments(
    projectConfig.root,
    'tsconfig.app.json',
  );

  if (tree.exists(tsconfigPath)) {
    updateJson<TsConfig>(
      tree,
      tsconfigPath,
      (json) => {
        json.files = [...json.files, 'src/main.server.ts'];

        json.include = [
          ...json.include,
          'src/app/pages/**/*.page.ts',
          'src/server/middleware/**/*.ts',
        ];

        return json;
      },
      { expectComments: true, allowTrailingComma: true },
    );
  }
}
