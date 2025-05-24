import { Tree } from '@nx/devkit';

export async function initVite(tree: Tree): Promise<void> {
  const linterOptions = {
    addPlugin: true,
    skipFormat: true,
  };
  await (
    await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      '@nx/vite'
    )
  ).initGenerator(tree, linterOptions);
}
