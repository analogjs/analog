import type { ExecutorContext } from '@nx/devkit';
import { join } from 'node:path';

export async function loadNxExecutor<T>(
  moduleId: string,
  exportName: string,
): Promise<T | undefined> {
  try {
    const nxModule = await import(moduleId);
    return nxModule[exportName];
  } catch {
    return undefined;
  }
}

export function loadEsm<T>(moduleId: string): Promise<T> {
  return Function('id', 'return import(id)')(moduleId);
}

export function getProjectRoot(context: ExecutorContext): string {
  return join(
    context.root,
    context.projectsConfigurations.projects[context.projectName as string].root,
  );
}

export function waitForExit(): Promise<void> {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve());
    process.once('SIGTERM', () => resolve());
    process.once('exit', () => resolve());
  });
}
