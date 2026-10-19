import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

export async function getBuildApplicationFunction(): Promise<{
  buildApplicationInternal: (...args: any[]) => any;
}> {
  const { VERSION } = await (Function(
    'return import("@angular/compiler-cli")',
  )() as Promise<{ VERSION: { major: string; minor: string } }>);

  if (Number(VERSION.major) < 20) {
    throw new Error(
      'This builder is not supported with versions earlier than Angular v20',
    );
  }

  const { buildApplicationInternal } = _require('@angular/build/private');

  return { buildApplicationInternal };
}
