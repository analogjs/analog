import { expect, test } from 'vitest';

// Regression test for #2364. This spec has no Angular decorators, so Angular's
// compilation skips it and the file reaches the vitest sourcemap plugin as raw
// TypeScript. The plugin's OXC path previously forced `lang: 'js'`, which
// failed to parse top-level TS-only syntax like the type annotation below
// (`[PARSE_ERROR] Missing initializer in const declaration`). If the file
// transforms and this test runs at all, the regression is fixed.
const data: [string, string][] = [['a', 'A']];

function mapToLabel(key: string): string {
  return data.find(([k]) => k === key)?.[1] ?? '';
}

test('transforms a decorator-free spec with TS-only syntax', () => {
  expect(mapToLabel('a')).toBe('A');
});
