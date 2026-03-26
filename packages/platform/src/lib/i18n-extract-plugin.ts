import { Plugin, ResolvedConfig } from 'vite';
import { resolve, dirname, extname } from 'node:path';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';

import { I18nOptions } from './options.js';

const FORMAT_EXTENSIONS: Record<string, string> = {
  json: '.json',
  xliff: '.xlf',
  xliff2: '.xlf',
  xmb: '.xmb',
};

/**
 * Vite plugin that extracts i18n messages from compiled JavaScript output.
 *
 * After the client build completes, this plugin scans all `.js` files in the
 * output directory for `$localize` tagged template literals and extracts the
 * message IDs and source text. It then writes the extracted messages to a
 * translation source file.
 *
 * Uses `@angular/localize/tools` MessageExtractor when available,
 * falling back to a regex-based extractor.
 */
export function i18nExtractPlugin(i18nOptions: I18nOptions): Plugin {
  let config: ResolvedConfig;
  let isSSRBuild = false;

  const extractConfig = i18nOptions.extract;
  if (!extractConfig) {
    return { name: 'analog-i18n-extract-noop' } as Plugin;
  }

  const format = extractConfig.format ?? 'json';

  return {
    name: 'analog-i18n-extract',
    apply: 'build',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      isSSRBuild = !!config.build.ssr;
    },

    async closeBundle() {
      // Only run on the client build, not SSR
      if (isSSRBuild) {
        return;
      }

      const outDir = resolve(config.root, config.build.outDir);
      const jsFiles = collectJsFiles(outDir);
      const filesWithLocalize = jsFiles.filter((file) => {
        const content = readFileSync(file, 'utf-8');
        return content.includes('$localize');
      });

      if (filesWithLocalize.length === 0) {
        return;
      }

      let messages: ExtractedMessage[];

      try {
        messages = await extractWithLocalizeTools(
          filesWithLocalize,
          config.root,
        );
      } catch {
        // @angular/localize/tools not available, use regex fallback
        messages = extractWithRegex(filesWithLocalize);
      }

      if (messages.length === 0) {
        return;
      }

      const ext = FORMAT_EXTENSIONS[format] ?? '.json';
      const defaultOutFile = `src/i18n/messages${ext}`;
      const outFile = resolve(
        config.root,
        extractConfig.outFile ?? defaultOutFile,
      );

      mkdirSync(dirname(outFile), { recursive: true });

      const output = serializeMessages(
        messages,
        format,
        i18nOptions.defaultLocale,
      );
      writeFileSync(outFile, output, 'utf-8');

      console.log(
        `\n[@analogjs/platform] Extracted ${messages.length} i18n message(s) to ${outFile}\n`,
      );
    },
  };
}

export interface ExtractedMessage {
  id: string;
  text: string;
  description?: string;
}

/**
 * Extracts messages using @angular/localize/tools MessageExtractor.
 * Throws if the package is not installed.
 */
async function extractWithLocalizeTools(
  files: string[],
  basePath: string,
): Promise<ExtractedMessage[]> {
  const localizeTools = await import('@angular/localize/tools');
  const { MessageExtractor, ɵParsedMessage } = localizeTools as any;

  const fs = {
    readFile: (path: string) => readFileSync(path, 'utf-8'),
    readFileBuffer: (path: string) => readFileSync(path),
    relative: (from: string, to: string) => {
      const { relative } = require('node:path');
      return relative(from, to);
    },
    resolve: (...paths: string[]) => resolve(...paths),
    exists: (path: string) => {
      try {
        statSync(path);
        return true;
      } catch {
        return false;
      }
    },
    dirname: (path: string) => dirname(path),
  };

  const logger = {
    debug: () => {},
    info: () => {},
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
    level: 0,
  };

  const extractor = new MessageExtractor(fs, logger, {
    basePath,
    useSourceMaps: false,
  });

  const messages: ExtractedMessage[] = [];

  for (const file of files) {
    try {
      const extracted = extractor.extractMessages(file);
      if (extracted?.messages) {
        for (const msg of extracted.messages) {
          messages.push({
            id: msg.id || msg.customId || msg.messageString,
            text: msg.messageString || msg.text || '',
            description: msg.description,
          });
        }
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  return messages;
}

/**
 * Regex-based fallback extractor for when @angular/localize/tools is not available.
 *
 * Parses `$localize` tagged template literals to extract message IDs and text.
 * Handles the common forms:
 *   $localize`:@@messageId:text`
 *   $localize`:description@@messageId:text`
 *   $localize`text`
 */
export function extractWithRegex(files: string[]): ExtractedMessage[] {
  const messages: ExtractedMessage[] = [];
  const seen = new Set<string>();

  // Match $localize`...` or $localize(__makeTemplateObject([...], [...]))
  // The tagged template form: $localize`:[description@@]id:text`
  const taggedTemplateRegex = /\$localize\s*`([^`]*)`/g;

  // Match the metadata block: :[@description@@]id:
  const metadataRegex = /^:((?:([^@]*)@@)?([^:]*)):(.*)$/s;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    let match: RegExpExecArray | null;

    taggedTemplateRegex.lastIndex = 0;
    while ((match = taggedTemplateRegex.exec(content)) !== null) {
      const body = match[1];
      const metaMatch = metadataRegex.exec(body);

      let id: string;
      let text: string;
      let description: string | undefined;

      if (metaMatch) {
        description = metaMatch[2]?.trim() || undefined;
        id = metaMatch[3];
        text = metaMatch[4];
      } else {
        // No metadata block — use the text as both id and text
        text = body;
        id = body;
      }

      if (id && !seen.has(id)) {
        seen.add(id);
        messages.push({ id, text, description });
      }
    }
  }

  return messages;
}

/**
 * Serializes extracted messages into the specified format.
 */
export function serializeMessages(
  messages: ExtractedMessage[],
  format: string,
  sourceLocale: string,
): string {
  switch (format) {
    case 'xliff':
      return serializeXliff1(messages, sourceLocale);
    case 'xliff2':
      return serializeXliff2(messages, sourceLocale);
    case 'xmb':
      return serializeXmb(messages);
    case 'json':
    default:
      return serializeJson(messages);
  }
}

function serializeJson(messages: ExtractedMessage[]): string {
  const obj: Record<string, string> = {};
  for (const msg of messages) {
    obj[msg.id] = msg.text;
  }
  return JSON.stringify(obj, null, 2) + '\n';
}

function serializeXliff1(
  messages: ExtractedMessage[],
  sourceLocale: string,
): string {
  const units = messages
    .map((msg) => {
      const note = msg.description
        ? `\n        <note>${escapeXml(msg.description)}</note>`
        : '';
      return `      <trans-unit id="${escapeXml(msg.id)}" datatype="html">
        <source>${escapeXml(msg.text)}</source>${note}
      </trans-unit>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="${sourceLocale}" datatype="plaintext" original="ng2.template">
    <body>
${units}
    </body>
  </file>
</xliff>
`;
}

function serializeXliff2(
  messages: ExtractedMessage[],
  sourceLocale: string,
): string {
  const units = messages
    .map((msg) => {
      const notes = msg.description
        ? `\n        <notes><note>${escapeXml(msg.description)}</note></notes>`
        : '';
      return `      <unit id="${escapeXml(msg.id)}">${notes}
        <segment>
          <source>${escapeXml(msg.text)}</source>
        </segment>
      </unit>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="${sourceLocale}">
  <file id="ngi18n" original="ng.template">
${units}
  </file>
</xliff>
`;
}

function serializeXmb(messages: ExtractedMessage[]): string {
  const msgs = messages
    .map((msg) => {
      const desc = msg.description
        ? ` desc="${escapeXml(msg.description)}"`
        : '';
      return `  <msg id="${escapeXml(msg.id)}"${desc}>${escapeXml(msg.text)}</msg>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE messagebundle [
<!ELEMENT messagebundle (msg)*>
<!ELEMENT msg (#PCDATA)>
<!ATTLIST msg id CDATA #REQUIRED>
<!ATTLIST msg desc CDATA #IMPLIED>
]>
<messagebundle>
${msgs}
</messagebundle>
`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Recursively collects all .js files from a directory.
 */
function collectJsFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectJsFiles(fullPath));
      } else if (entry.isFile() && extname(entry.name) === '.js') {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist yet (e.g., first build)
  }

  return files;
}
