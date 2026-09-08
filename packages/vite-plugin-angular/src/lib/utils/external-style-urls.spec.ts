import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  externalStyleUrl,
  externalStyleUrlTransformer,
} from './external-style-urls.js';

describe('external stylesheet URLs', () => {
  it.each([
    ['D:\\app\\src\\view.css', '/@fs/D:/app/src/view.css'],
    ['D:/app/src/view.css', '/@fs/D:/app/src/view.css'],
    ['\\\\server\\share\\view.css', '/@fs///server/share/view.css'],
    ['/src/view.css', '/src/view.css'],
    ['https://example.test/view.css', 'https://example.test/view.css'],
  ])('maps %s to a browser request URL', (file, expected) => {
    expect(externalStyleUrl(file)).toBe(expected);
  });

  it('changes only Angular external-style call arguments', () => {
    const source =
      'const path = "D:/app/view.css"; i0.ɵɵExternalStylesFeature(["D:/app/view.css", dynamicUrl]);';
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
      transformers: { after: [externalStyleUrlTransformer] },
    }).outputText;
    expect(output).toContain('const path = "D:/app/view.css"');
    expect(output).toContain(
      'i0.ɵɵExternalStylesFeature(["/@fs/D:/app/view.css", dynamicUrl])',
    );
  });
});
