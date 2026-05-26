import type { MarkedExtension, Tokens } from 'marked';

const TABS_PATTERN = /^<Tabs\b[^>]*>([\s\S]*?)<\/Tabs>\s*(?:\n|$)/;
const TAB_ITEM_PATTERN =
  /<TabItem\b[^>]*\b(?:label|value)="([^"]+)"[^>]*>([\s\S]*?)<\/TabItem>/g;

interface TabsToken extends Tokens.Generic {
  type: 'mdxTabs';
  raw: string;
  items: { label: string; tokens: Tokens.Generic[] }[];
}

function humanLabel(rawLabel: string): string {
  // Preserve the source casing exactly — npm stays npm, Yarn stays Yarn.
  return rawLabel;
}

export const mdxTabsExtension: MarkedExtension = {
  extensions: [
    {
      name: 'mdxTabs',
      level: 'block',
      start(src) {
        const i = src.indexOf('<Tabs');
        return i === -1 ? undefined : i;
      },
      tokenizer(src) {
        const match = TABS_PATTERN.exec(src);
        if (!match) return undefined;
        const [raw, inner] = match;

        const items: TabsToken['items'] = [];
        TAB_ITEM_PATTERN.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = TAB_ITEM_PATTERN.exec(inner)) !== null) {
          const label = humanLabel(m[1]);
          const body = m[2].trim();
          items.push({
            label,
            tokens: this.lexer.blockTokens(body, []),
          });
        }
        if (items.length === 0) return undefined;

        return { type: 'mdxTabs', raw, items } satisfies TabsToken;
      },
      renderer(token) {
        const t = token as TabsToken;
        const sections = t.items
          .map(
            (item) =>
              `<section class="doc-tab"><h4 class="doc-tab-label">${item.label}</h4>${this.parser.parse(item.tokens)}</section>`,
          )
          .join('');
        return `<div class="doc-tabs">${sections}</div>`;
      },
    },
  ],
};
