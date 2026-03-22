import { resolve, dirname, join, relative } from 'node:path';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import type { Plugin } from 'vite';

function formatDeclarationError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

export function oxcDtsPlugin(pkgDir: string): Plugin {
  return {
    name: 'oxc-dts',
    async writeBundle(options, bundle) {
      const { isolatedDeclarationSync } = await import('oxc-transform');
      const outDir = options.dir!;

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.facadeModuleId) continue;

        const sourceFile = chunk.facadeModuleId;
        if (!sourceFile.endsWith('.ts') || sourceFile.endsWith('.d.ts'))
          continue;

        if (!existsSync(sourceFile)) {
          this.warn(
            [
              `Skipping declaration emit for bundle entry "${fileName}".`,
              `Source file not found: ${sourceFile}`,
              'A follow-up source-tree pass will attempt to emit the declaration.',
            ].join('\n'),
          );
          continue;
        }

        try {
          const source = readFileSync(sourceFile, 'utf-8');
          const result = isolatedDeclarationSync(sourceFile, source, {
            sourcemap: false,
          });

          if (result.code) {
            const dtsPath = join(outDir, fileName.replace(/\.js$/, '.d.ts'));
            mkdirSync(dirname(dtsPath), { recursive: true });
            writeFileSync(dtsPath, result.code);
          }
        } catch (error) {
          this.error(
            [
              `Failed to emit declaration for bundle entry "${fileName}".`,
              `Source file: ${sourceFile}`,
              formatDeclarationError(error),
            ].join('\n'),
          );
        }
      }

      // Generate .d.ts for type-only source files that were tree-shaken
      const srcDir = resolve(pkgDir, 'src');
      for (const tsFile of walkTs(srcDir)) {
        const relPath = relative(pkgDir, tsFile);
        const dtsOut = join(outDir, relPath.replace(/\.ts$/, '.d.ts'));

        try {
          readFileSync(dtsOut);
          continue;
        } catch {
          // not yet generated
        }

        try {
          const source = readFileSync(tsFile, 'utf-8');
          const result = isolatedDeclarationSync(tsFile, source, {
            sourcemap: false,
          });

          if (result.code) {
            mkdirSync(dirname(dtsOut), { recursive: true });
            writeFileSync(dtsOut, result.code);
          }
        } catch (error) {
          this.error(
            [
              `Failed to emit declaration for source file "${tsFile}".`,
              `Output path: ${dtsOut}`,
              formatDeclarationError(error),
            ].join('\n'),
          );
        }
      }
    },
  };
}

export function copyPackageJsonPlugin(pkgDir: string): Plugin {
  return {
    name: 'copy-package-json',
    async writeBundle(options) {
      const outDir = options.dir!;
      copyFileSync(join(pkgDir, 'package.json'), join(outDir, 'package.json'));
    },
  };
}

export function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkTs(full);
    } else if (
      full.endsWith('.ts') &&
      !full.endsWith('.spec.ts') &&
      !full.endsWith('.spec.data.ts') &&
      !full.endsWith('.test.ts') &&
      !full.endsWith('.d.ts')
    ) {
      yield full;
    }
  }
}
