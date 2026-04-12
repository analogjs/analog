import { describe, expect, it } from 'vitest';
import {
  extractWithRegex,
  serializeMessages,
  ExtractedMessage,
} from './i18n-extract-plugin.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

describe('extractWithRegex', () => {
  const tmpDir = resolve(tmpdir(), 'analog-i18n-test-' + Date.now());

  function createTempFile(name: string, content: string): string {
    mkdirSync(tmpDir, { recursive: true });
    const filePath = resolve(tmpDir, name);
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  afterAll(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  });

  it('should extract messages with id and text', () => {
    const file = createTempFile(
      'test1.js',
      'const msg = $localize`:@@greeting:Hello`;',
    );

    const messages = extractWithRegex([file]);

    expect(messages).toEqual([
      { id: 'greeting', text: 'Hello', description: undefined },
    ]);
  });

  it('should extract messages with description, id, and text', () => {
    const file = createTempFile(
      'test2.js',
      'const msg = $localize`:A friendly greeting@@greeting:Hello`;',
    );

    const messages = extractWithRegex([file]);

    expect(messages).toEqual([
      {
        id: 'greeting',
        text: 'Hello',
        description: 'A friendly greeting',
      },
    ]);
  });

  it('should extract messages without metadata', () => {
    const file = createTempFile(
      'test3.js',
      'const msg = $localize`Hello World`;',
    );

    const messages = extractWithRegex([file]);

    expect(messages).toEqual([
      { id: 'Hello World', text: 'Hello World', description: undefined },
    ]);
  });

  it('should extract multiple messages from a single file', () => {
    const file = createTempFile(
      'test4.js',
      `
      const a = $localize\`:@@hello:Hello\`;
      const b = $localize\`:@@goodbye:Goodbye\`;
    `,
    );

    const messages = extractWithRegex([file]);

    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe('hello');
    expect(messages[1].id).toBe('goodbye');
  });

  it('should deduplicate messages by id', () => {
    const file = createTempFile(
      'test5.js',
      `
      const a = $localize\`:@@greeting:Hello\`;
      const b = $localize\`:@@greeting:Hello\`;
    `,
    );

    const messages = extractWithRegex([file]);

    expect(messages).toHaveLength(1);
  });

  it('should extract from multiple files', () => {
    const file1 = createTempFile(
      'test6a.js',
      'const a = $localize`:@@hello:Hello`;',
    );
    const file2 = createTempFile(
      'test6b.js',
      'const b = $localize`:@@goodbye:Goodbye`;',
    );

    const messages = extractWithRegex([file1, file2]);

    expect(messages).toHaveLength(2);
  });

  it('should return empty array for files without $localize', () => {
    const file = createTempFile('test7.js', 'const msg = "Hello";');

    const messages = extractWithRegex([file]);

    expect(messages).toEqual([]);
  });
});

describe('serializeMessages', () => {
  const messages: ExtractedMessage[] = [
    { id: 'greeting', text: 'Hello', description: 'A greeting' },
    { id: 'farewell', text: 'Goodbye' },
  ];

  it('should serialize to JSON', () => {
    const output = serializeMessages(messages, 'json', 'en');
    const parsed = JSON.parse(output);

    expect(parsed).toEqual({
      greeting: 'Hello',
      farewell: 'Goodbye',
    });
  });

  it('should serialize to XLIFF 1.2', () => {
    const output = serializeMessages(messages, 'xliff', 'en');

    expect(output).toContain('xliff version="1.2"');
    expect(output).toContain('source-language="en"');
    expect(output).toContain('trans-unit id="greeting"');
    expect(output).toContain('<source>Hello</source>');
    expect(output).toContain('<note>A greeting</note>');
    expect(output).toContain('trans-unit id="farewell"');
  });

  it('should serialize to XLIFF 2.0', () => {
    const output = serializeMessages(messages, 'xliff2', 'en');

    expect(output).toContain('xliff version="2.0"');
    expect(output).toContain('srcLang="en"');
    expect(output).toContain('unit id="greeting"');
    expect(output).toContain('<source>Hello</source>');
    expect(output).toContain('<note>A greeting</note>');
  });

  it('should serialize to XMB', () => {
    const output = serializeMessages(messages, 'xmb', 'en');

    expect(output).toContain('<messagebundle>');
    expect(output).toContain('msg id="greeting"');
    expect(output).toContain('desc="A greeting"');
    expect(output).toContain('>Hello</msg>');
    expect(output).toContain('msg id="farewell"');
  });

  it('should escape XML special characters', () => {
    const msgs: ExtractedMessage[] = [
      { id: 'html', text: '<b>Bold & "quoted"</b>' },
    ];
    const output = serializeMessages(msgs, 'xliff', 'en');

    expect(output).toContain(
      '&lt;b&gt;Bold &amp; &quot;quoted&quot;&lt;/b&gt;',
    );
  });
});
