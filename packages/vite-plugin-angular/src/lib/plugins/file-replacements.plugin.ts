// source: https://github.com/Myrmod/vitejs-theming/blob/master/build-plugins/rollup/replace-files.js
import { isAbsolute, resolve } from 'node:path';
import { Plugin } from 'vite';

export function replaceFiles(
  replacements: FileReplacement[],
  workspaceRoot: string,
): Plugin | false {
  if (!replacements?.length) {
    return false;
  }

  return {
    name: 'rollup-plugin-replace-files',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      /**
       * The reason we're using endsWith here is because the resolved id
       * will be the absolute path to the file. We want to check if the
       * file ends with the file we're trying to replace, which will be essentially
       * the path from the root of our workspace.
       */
      const mappedReplacements = replacements.map((fr: FileReplacement) => {
        const frSSR = fr as FileReplacementSSR;
        const frWith = fr as FileReplacementWith;

        return {
          ...fr,
          ssr: frSSR.ssr
            ? isAbsolute(frSSR.ssr)
              ? frSSR.ssr
              : resolve(workspaceRoot, frSSR.ssr)
            : '',
          with: frWith.with
            ? isAbsolute(frWith.with)
              ? frWith.with
              : resolve(workspaceRoot, frWith.with)
            : '',
        };
      });
      const foundReplace = mappedReplacements.find((replacement) =>
        resolved?.id?.endsWith(replacement.replace),
      );
      if (foundReplace) {
        try {
          if (this.environment.name === 'ssr' && foundReplace.ssr) {
            // return new file id for ssr
            return {
              id: foundReplace.ssr,
            };
          } else if (foundReplace.ssr) {
            return null;
          }

          // return new file id
          return {
            id: foundReplace.with,
          };
        } catch (err) {
          console.error(err);
          return null;
        }
      }
      return null;
    },
  };
}

export type FileReplacement = FileReplacementWith | FileReplacementSSR;

export interface FileReplacementBase {
  replace: string;
}
export interface FileReplacementWith extends FileReplacementBase {
  with: string;
}

export interface FileReplacementSSR extends FileReplacementBase {
  ssr: string;
}
