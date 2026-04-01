import { expect } from 'vitest';
import { scanFile, ComponentRegistry } from './registry';
import { compile as rawCompile, CompileResult } from './compile';

export function buildRegistry(
  files: Record<string, string>,
): ComponentRegistry {
  const registry: ComponentRegistry = new Map();
  for (const [fileName, code] of Object.entries(files)) {
    for (const entry of scanFile(code, fileName)) {
      registry.set(entry.className, entry);
    }
  }
  return registry;
}

/** Convenience wrapper: compile and return just the code string. */
export function compileCode(
  sourceCode: string,
  fileName: string,
  registry?: ComponentRegistry,
): string {
  return rawCompile(sourceCode, fileName, registry).code;
}

export function expectCompiles(result: string) {
  expect(result).toBeTruthy();
  expect(result).not.toMatch(/^Error:/m);
}
