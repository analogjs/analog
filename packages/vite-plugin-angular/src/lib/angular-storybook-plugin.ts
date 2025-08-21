import fs from 'node:fs';
import { resolve } from 'node:path';

export function angularStorybookPlugin(workspaceRoot: string) {
  const esmPath = resolve(
    workspaceRoot,
    'node_modules/@storybook/angular/dist/client/index.mjs',
  );
  const hasESM = fs.existsSync(esmPath);

  return {
    name: 'analogjs-storybook-import-plugin',
    transform(code: string, id: string) {
      if (id.includes('node_modules')) {
        return;
      }

      if (code.includes('"@storybook/angular"')) {
        return code.replace(
          /\"@storybook\/angular\"/g,
          `"@storybook/angular/dist/client/index.${hasESM ? 'm' : ''}js"`,
        );
      }

      if (code.includes("'@storybook/angular'")) {
        return code.replace(
          /\'@storybook\/angular\'/g,
          `'@storybook/angular/dist/client/index.${hasESM ? 'm' : ''}js'`,
        );
      }

      return;
    },
  };
}
