import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [sourceDir, destDir] = process.argv.slice(2);

if (!sourceDir || !destDir) {
  throw new Error(
    'Usage: node tools/scripts/copy-build-output.mts <sourceDir> <destDir>',
  );
}

const from = resolve(sourceDir);
const to = resolve(destDir);

mkdirSync(dirname(to), { recursive: true });
cpSync(from, to, { recursive: true });
