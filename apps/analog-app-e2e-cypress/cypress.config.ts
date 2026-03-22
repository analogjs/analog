import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { defineConfig } from 'cypress';
import ts from 'typescript';

export default defineConfig({
  e2e: {
    specPattern: 'src/**/*.cy.ts',
    supportFile: false,
    setupNodeEvents(on) {
      on('file:preprocessor', async (file) => {
        const relativePath = relative(__dirname, file.filePath);
        const outputPath = join(
          tmpdir(),
          'analog-app-e2e-cypress',
          relativePath.replace(/\.ts$/, '.js'),
        );

        const source = await readFile(file.filePath, 'utf8');
        await mkdir(dirname(outputPath), { recursive: true });
        const result = ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            sourceMap: true,
          },
          fileName: file.filePath,
        });
        await writeFile(outputPath, result.outputText, 'utf8');

        return outputPath;
      });
    },
  },
  video: false,
});
