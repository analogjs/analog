import type { MarkedExtension, Tokens } from 'marked';

const TABS_PATTERN = /^<Tabs\b[^>]*>([\s\S]*?)<\/Tabs>\s*(?:\n|$)/;
const TAB_ITEM_PATTERN = /<TabItem\b([^>]*)>([\s\S]*?)<\/TabItem>/g;
const LABEL_ATTR = /\blabel="([^"]+)"/;
const VALUE_ATTR = /\bvalue="([^"]+)"/;

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
          const attrs = m[1];
          // Prefer explicit `label="..."` over the slug-y `value="..."`.
          const labelMatch = LABEL_ATTR.exec(attrs) ?? VALUE_ATTR.exec(attrs);
          const label = humanLabel(labelMatch?.[1] ?? '');
          if (!label) continue;
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
        const headers = t.items
          .map(
            (item, i) =>
              `<button type="button" class="doc-tabs-trigger" data-index="${i}"${i === 0 ? ' data-active="true"' : ''}>${item.label}</button>`,
          )
          .join('');
        const panels = t.items
          .map(
            (item, i) =>
              `<section class="doc-tab" data-index="${i}"${i === 0 ? '' : ' hidden'}>${this.parser.parse(item.tokens)}</section>`,
          )
          .join('');
        return `<div class="doc-tabs" data-tabs><div class="doc-tabs-headers">${headers}</div>${panels}</div>`;
      },
    },
  ],
};
