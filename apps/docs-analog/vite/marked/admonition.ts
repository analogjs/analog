import type { MarkedExtension, Tokens } from 'marked';

type AdmonitionKind = 'tip' | 'info' | 'note' | 'warning' | 'caution';

const KIND_PATTERN =
  /^:::(tip|info|note|warning|caution)\s*\n([\s\S]*?)\n:::(?:\n|$)/;

interface AdmonitionToken extends Tokens.Generic {
  type: 'admonition';
  raw: string;
  kind: AdmonitionKind;
  tokens: Tokens.Generic[];
}

export const admonitionExtension: MarkedExtension = {
  extensions: [
    {
      name: 'admonition',
      level: 'block',
      start(src) {
        const i = src.indexOf('\n:::');
        return i === -1 ? (src.startsWith(':::') ? 0 : undefined) : i + 1;
      },
      tokenizer(src) {
        const match = KIND_PATTERN.exec(src);
        if (!match) return undefined;
        const [raw, kind, body] = match;
        return {
          type: 'admonition',
          raw,
          kind: kind as AdmonitionKind,
          tokens: this.lexer.blockTokens(body.trim(), []),
        } satisfies AdmonitionToken;
      },
      renderer(token) {
        const t = token as AdmonitionToken;
        const inner = this.parser.parse(t.tokens);
        return `<aside class="admonition admonition-${t.kind}">${inner}</aside>`;
      },
    },
  ],
};
