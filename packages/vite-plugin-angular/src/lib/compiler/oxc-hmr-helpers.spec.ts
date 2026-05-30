import { describe, expect, it } from 'vitest';

import {
  extractInlineStyles,
  extractInlineTemplate,
  locateComponentDecorators,
  locateStylesInArgs,
  stripComponentMetadata,
} from './oxc-hmr-helpers.js';

describe('oxc-hmr-helpers', () => {
  describe('locateComponentDecorators', () => {
    it('returns argsRange + className for each @Component class', () => {
      const code = `
        @Component({ selector: 'a-foo', template: '<p></p>' })
        export class Foo {}

        @Component({ selector: 'a-bar', template: '<i></i>' })
        class Bar {}
      `;
      const out = locateComponentDecorators(code);
      expect(out.map((d) => d.className)).toEqual(['Foo', 'Bar']);
      for (const d of out) {
        expect(code[d.argsRange[0]]).toBe('(');
        expect(code[d.argsRange[1]]).toBe(')');
      }
    });

    it('ignores classes without @Component', () => {
      const code = `
        @Directive({ selector: '[a-foo]' })
        export class Foo {}
      `;
      expect(locateComponentDecorators(code)).toEqual([]);
    });
  });

  describe('extractInlineTemplate', () => {
    it('returns raw template content from a single-quoted string', () => {
      const code = `@Component({ template: '<p>hi</p>' }) class C {}`;
      expect(extractInlineTemplate(code, 'C')).toBe('<p>hi</p>');
    });

    it('returns raw template content from a backtick literal with interpolation placeholders', () => {
      const code = '@Component({ template: `<p>${name()}</p>` }) class C {}';
      expect(extractInlineTemplate(code, 'C')).toBe('<p>${name()}</p>');
    });

    it('returns null when className is unknown', () => {
      const code = `@Component({ template: '<p></p>' }) class C {}`;
      expect(extractInlineTemplate(code, 'Missing')).toBeNull();
    });
  });

  describe('extractInlineStyles', () => {
    it('returns single-element array for `styles: "..."`', () => {
      const code = `@Component({ styles: 'p { color: red }' }) class C {}`;
      expect(extractInlineStyles(code, 'C')).toEqual(['p { color: red }']);
    });

    it('returns each raw element for `styles: [...]`', () => {
      const code = `@Component({ styles: ['a { }', \`b { }\`, "c { }"] }) class C {}`;
      expect(extractInlineStyles(code, 'C')).toEqual([
        'a { }',
        'b { }',
        'c { }',
      ]);
    });

    it('returns null when there is no styles field', () => {
      const code = `@Component({ template: '' }) class C {}`;
      expect(extractInlineStyles(code, 'C')).toBeNull();
    });
  });

  describe('stripComponentMetadata', () => {
    it('blanks template and styles values but keeps delimiters', () => {
      const code = `@Component({ selector: 'a', template: '<p>hi</p>', styles: ['x'] }) class C {}`;
      const stripped = stripComponentMetadata(code);
      expect(stripped).toBe(
        `@Component({ selector: 'a', template: '', styles: [] }) class C {}`,
      );
    });

    it('matches across multiple components in one file', () => {
      const code = `@Component({ template: 'a' }) class A {}
@Component({ template: 'b' }) class B {}`;
      const stripped = stripComponentMetadata(code);
      expect(stripped).toBe(`@Component({ template: '' }) class A {}
@Component({ template: '' }) class B {}`);
    });

    it('produces identical output when only the template changes', () => {
      const before = `@Component({ template: '<p>old</p>', styles: ['x'] }) class C {}`;
      const after = `@Component({ template: '<p>new</p>', styles: ['x'] }) class C {}`;
      expect(stripComponentMetadata(before)).toBe(
        stripComponentMetadata(after),
      );
    });
  });

  describe('locateStylesInArgs', () => {
    it('returns opener/closer indices for the styles value', () => {
      const code = `@Component({ styles: ['a', 'b'] }) class C {}`;
      const decorators = locateComponentDecorators(code);
      const range = locateStylesInArgs(code, decorators[0].argsRange)!;
      expect(code[range[0]]).toBe('[');
      expect(code[range[1]]).toBe(']');
    });

    it('returns null when there is no styles field', () => {
      const code = `@Component({ template: '<p></p>' }) class C {}`;
      const decorators = locateComponentDecorators(code);
      expect(locateStylesInArgs(code, decorators[0].argsRange)).toBeNull();
    });
  });
});
