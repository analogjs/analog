import { describe, it, expect } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  parseRawContentFile,
  parseRawContentFileAsync,
  FrontmatterValidationError,
} from './parse-raw-content-file';

function createMockSchema<T>(
  validator: (value: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: validator,
    },
  };
}

const sampleMarkdown = `---
title: Hello World
date: "2024-01-15"
tags:
  - typescript
  - angular
---

# Hello World

Some content here.
`;

const invalidMarkdown = `---
title: Missing Date
---

Content without required fields.
`;

const emptyFrontmatter = `---
---

Content with empty frontmatter.
`;

const noFrontmatter = `# Just Markdown

No frontmatter at all.
`;

const frontmatterOnly = `---
title: Only Frontmatter
draft: true
---`;

describe('parseRawContentFile', () => {
  describe('legacy behavior (no schema)', () => {
    it('should parse frontmatter without schema', () => {
      const result = parseRawContentFile<{ title: string; date: string }>(
        sampleMarkdown,
      );
      expect(result.attributes.title).toBe('Hello World');
      expect(result.attributes.date).toBe('2024-01-15');
      expect(result.content).toContain('# Hello World');
    });

    it('should handle empty frontmatter without schema', () => {
      const result = parseRawContentFile(emptyFrontmatter);
      expect(result.attributes).toEqual({});
      expect(result.content).toContain('Content with empty frontmatter.');
    });

    it('should handle content with no frontmatter', () => {
      const result = parseRawContentFile(noFrontmatter);
      expect(result.content).toContain('# Just Markdown');
    });

    it('should handle frontmatter with no body content', () => {
      const result = parseRawContentFile<{ title: string; draft: boolean }>(
        frontmatterOnly,
      );
      expect(result.attributes.title).toBe('Only Frontmatter');
      expect(result.attributes.draft).toBe(true);
      expect(result.content).toBe('');
    });
  });

  describe('schema validation', () => {
    it('should validate frontmatter with schema and return typed output', () => {
      const schema = createMockSchema<{
        title: string;
        date: string;
        tags: string[];
      }>((value) => {
        const v = value as Record<string, unknown>;
        if (v.title && v.date && Array.isArray(v.tags)) {
          return {
            value: v as { title: string; date: string; tags: string[] },
          };
        }
        return { issues: [{ message: 'Invalid' }] };
      });

      const result = parseRawContentFile(sampleMarkdown, schema);
      expect(result.attributes.title).toBe('Hello World');
      expect(result.attributes.tags).toEqual(['typescript', 'angular']);
      expect(result.content).toContain('# Hello World');
    });

    it('should throw FrontmatterValidationError on validation failure', () => {
      const schema = createMockSchema<{ title: string; date: string }>(
        (value) => {
          const v = value as Record<string, unknown>;
          const issues: StandardSchemaV1.Issue[] = [];
          if (!v.date) {
            issues.push({ message: 'Required', path: ['date'] });
          }
          if (issues.length) return { issues };
          return { value: v as { title: string; date: string } };
        },
      );

      expect(() => parseRawContentFile(invalidMarkdown, schema)).toThrow(
        FrontmatterValidationError,
      );

      try {
        parseRawContentFile(invalidMarkdown, schema);
      } catch (e) {
        const err = e as FrontmatterValidationError;
        expect(err.issues).toHaveLength(1);
        expect(err.issues[0].message).toBe('Required');
        expect(err.issues[0].path).toEqual(['date']);
        expect(err.message).toContain('rontmatter validation failed');
        expect(err.message).toContain('Required');
      }
    });

    it('should include filename in sync validation errors when provided', () => {
      const schema = createMockSchema<{ title: string }>(() => ({
        issues: [{ message: 'Required', path: ['title'] }],
      }));

      expect(() =>
        parseRawContentFile(invalidMarkdown, schema, 'blog/my-post.md'),
      ).toThrow(FrontmatterValidationError);

      try {
        parseRawContentFile(invalidMarkdown, schema, 'blog/my-post.md');
      } catch (e) {
        const err = e as FrontmatterValidationError;
        expect(err.filename).toBe('blog/my-post.md');
        expect(err.message).toContain('"blog/my-post.md"');
      }
    });

    it('should throw on async schema in sync parseRawContentFile', () => {
      const asyncSchema: StandardSchemaV1 = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async () => ({ value: {} }),
        },
      };

      expect(() => parseRawContentFile(sampleMarkdown, asyncSchema)).toThrow(
        'does not support async schema validation',
      );
    });

    it('should validate empty frontmatter against schema', () => {
      const schema = createMockSchema<{ title: string }>(() => ({
        issues: [{ message: 'Title is required', path: ['title'] }],
      }));

      expect(() => parseRawContentFile(emptyFrontmatter, schema)).toThrow(
        FrontmatterValidationError,
      );
    });

    it('should handle schema that transforms values', () => {
      const schema = createMockSchema<{
        title: string;
        tags: string[];
        tagCount: number;
      }>((value) => {
        const v = value as { title: string; tags: string[] };
        return {
          value: {
            title: v.title.toUpperCase(),
            tags: v.tags,
            tagCount: v.tags.length,
          },
        };
      });

      const result = parseRawContentFile(sampleMarkdown, schema);
      expect(result.attributes.title).toBe('HELLO WORLD');
      expect(result.attributes.tagCount).toBe(2);
    });

    it('should handle schema that adds default values', () => {
      const schema = createMockSchema<{
        title: string;
        draft: boolean;
      }>((value) => {
        const v = value as Record<string, unknown>;
        return {
          value: {
            title: (v.title as string) ?? 'Untitled',
            draft: (v.draft as boolean) ?? false,
          },
        };
      });

      const result = parseRawContentFile(invalidMarkdown, schema);
      expect(result.attributes.title).toBe('Missing Date');
      expect(result.attributes.draft).toBe(false);
    });

    it('should handle multiple validation issues', () => {
      const schema = createMockSchema(() => ({
        issues: [
          { message: 'Title required', path: ['title'] },
          { message: 'Date required', path: ['date'] },
          { message: 'Tags required', path: ['tags'] },
        ],
      }));

      try {
        parseRawContentFile(emptyFrontmatter, schema);
      } catch (e) {
        const err = e as FrontmatterValidationError;
        expect(err.issues).toHaveLength(3);
        expect(err.message).toContain('Title required');
        expect(err.message).toContain('Date required');
        expect(err.message).toContain('Tags required');
      }
    });

    it('should handle nested path segments in error messages', () => {
      const schema = createMockSchema(() => ({
        issues: [
          {
            message: 'Invalid URL',
            path: ['meta', { key: 'og:image' }],
          },
        ],
      }));

      try {
        parseRawContentFile(sampleMarkdown, schema);
      } catch (e) {
        const err = e as FrontmatterValidationError;
        expect(err.message).toContain('meta.og:image');
      }
    });
  });

  describe('FrontmatterValidationError', () => {
    it('should include filename in error message when provided', () => {
      const err = new FrontmatterValidationError(
        [{ message: 'Missing title' }],
        'blog/my-post.md',
      );
      expect(err.message).toContain('"blog/my-post.md"');
      expect(err.filename).toBe('blog/my-post.md');
    });

    it('should format error without filename', () => {
      const err = new FrontmatterValidationError([
        { message: 'Missing title' },
      ]);
      expect(err.message).toContain('Frontmatter validation failed:');
      expect(err.filename).toBeUndefined();
    });

    it('should have correct error name', () => {
      const err = new FrontmatterValidationError([{ message: 'test' }]);
      expect(err.name).toBe('FrontmatterValidationError');
      expect(err).toBeInstanceOf(Error);
    });

    it('should format issues without paths', () => {
      const err = new FrontmatterValidationError([
        { message: 'General error' },
      ]);
      expect(err.message).toContain('General error');
      expect(err.message).not.toContain('at "');
    });
  });
});

describe('parseRawContentFileAsync', () => {
  it('should validate with async schema', async () => {
    const schema: StandardSchemaV1<unknown, { title: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) => ({
          value: value as { title: string },
        }),
      },
    };

    const result = await parseRawContentFileAsync(sampleMarkdown, schema);
    expect(result.attributes.title).toBe('Hello World');
    expect(result.content).toContain('# Hello World');
  });

  it('should throw FrontmatterValidationError on async validation failure', async () => {
    const schema: StandardSchemaV1<unknown, { title: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({
          issues: [{ message: 'Async validation failed' }],
        }),
      },
    };

    await expect(
      parseRawContentFileAsync(sampleMarkdown, schema),
    ).rejects.toThrow(FrontmatterValidationError);
  });

  it('should include filename in async validation errors when provided', async () => {
    const schema: StandardSchemaV1<unknown, { title: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({
          issues: [{ message: 'Async validation failed' }],
        }),
      },
    };

    await expect(
      parseRawContentFileAsync(sampleMarkdown, schema, 'blog/async-post.md'),
    ).rejects.toMatchObject({
      filename: 'blog/async-post.md',
      message: expect.stringContaining('"blog/async-post.md"'),
    });
  });

  it('should handle async schema that transforms values', async () => {
    const schema: StandardSchemaV1<unknown, { title: string; slug: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) => {
          const v = value as { title: string };
          return {
            value: {
              title: v.title,
              slug: v.title.toLowerCase().replace(/\s+/g, '-'),
            },
          };
        },
      },
    };

    const result = await parseRawContentFileAsync(sampleMarkdown, schema);
    expect(result.attributes.slug).toBe('hello-world');
  });

  it('should work with sync schemas too', async () => {
    const schema = createMockSchema<{ title: string }>((value) => ({
      value: value as { title: string },
    }));

    const result = await parseRawContentFileAsync(sampleMarkdown, schema);
    expect(result.attributes.title).toBe('Hello World');
  });
});
