import { SourceMap } from 'node:module';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compile } from './compile';

describe('hoisted statement source maps', () => {
  it.each(['\n', '\r\n'])(
    'preserves original positions with %j line endings',
    (newline) => {
      const source = [
        "import { Component } from '@angular/core';",
        "@Component({ selector: 'app-test', template: '' })",
        'export class TestComponent {}',
        '// A helper used by application code.',
        'const helper = () => 42',
        'function greeting() { return helper(); }',
        'const last = greeting()',
      ].join(newline);
      const { code, map } = compile(source, 'test.ts');
      const sourceMap = new SourceMap(JSON.parse(map.toString()));
      const position = (text: string, token: string) => {
        const prefix = text.slice(0, text.indexOf(token));
        const lines = prefix.split('\n');
        return { line: lines.length, column: lines.at(-1)!.length + 1 };
      };

      for (const token of [
        'helper =',
        'greeting()',
        'last =',
        'return helper',
      ]) {
        const generated = position(code, token);
        const original = position(source, token);
        expect(
          sourceMap.findOrigin(generated.line, generated.column),
        ).toMatchObject({
          lineNumber: original.line,
          columnNumber: original.column,
        });
      }
      expect(code.indexOf('const helper')).toBeLessThan(
        code.indexOf('function greeting'),
      );
      expect(code.indexOf('function greeting')).toBeLessThan(
        code.indexOf('const last'),
      );
      expect(code.indexOf('const last')).toBeLessThan(
        code.indexOf('class TestComponent'),
      );
      expect(
        ts.transpileModule(code, { reportDiagnostics: true }).diagnostics,
      ).toEqual([]);
      expect(JSON.parse(map.toString()).sourcesContent).toEqual([source]);
    },
  );
});
