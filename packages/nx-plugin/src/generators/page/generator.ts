import {
  convertNxGenerator,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  stripIndents,
  Tree,
} from '@nx/devkit';
import { join } from 'node:path';
import { AnalogPageGeneratorSchema, NormalizedSchema } from './schema';

function normalizeOptions(
  tree: Tree,
  options: AnalogPageGeneratorSchema,
): NormalizedSchema {
  const projectRoot = `${getWorkspaceLayout(tree).appsDir}/${options.project}`;
  return {
    ...options,
    projectRoot,
  };
}

function generateFileName(input: string) {
  const pattern = /^[a-zA-Z0-9]+\.\[[a-zA-Z0-9-]+\]$/;
  if (pattern.test(input)) {
    return input.replace(/\[[a-zA-Z0-9-]+\]/, (match) => {
      const wordId = match.slice(1, -1);
      const camelCaseWordId = wordId.replace(/-([a-zA-Z0-9])/g, (_, letter) =>
        letter.toUpperCase(),
      );
      return `[${camelCaseWordId}]`;
    });
  } else {
    return input;
  }
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  const splitName = options.pathname.split('/');
  const routeName = splitName[splitName.length - 1];
  const fileName = generateFileName(routeName);
  const templateOptions = {
    ...options,
    ...names(routeName),
    name: names(routeName).fileName,
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    template: '',
    fileName,
  };

  const pageFolders = options.pathname.split('/').slice(0, -1);
  const pageDir = join(options.projectRoot, 'src/app/pages', ...pageFolders);

  generateFiles(tree, join(__dirname, 'files'), pageDir, templateOptions);
}

export async function analogPageGenerator(
  tree: Tree,
  options: AnalogPageGeneratorSchema,
) {
  const normalizedOptions = normalizeOptions(tree, options);
  if (options.redirectPage && !options.redirectPath) {
    throw new Error(
      stripIndents`A redirectPath is required when redirectPage is true.`,
    );
  }
  addFiles(tree, normalizedOptions);

  await formatFiles(tree);
}

export const analogPageGeneratorSchematic =
  convertNxGenerator(analogPageGenerator);

export default analogPageGenerator;
