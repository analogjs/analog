import type { LinkToInput } from '@analogjs/router';
import { docsLink } from './routes';

export type SidebarDoc = {
  kind: 'doc';
  id: string;
  label: string;
};

export type SidebarCategory = {
  kind: 'category';
  label: string;
  items: SidebarNode[];
};

export type SidebarBreak = {
  kind: 'break';
};

export type SidebarNode = SidebarDoc | SidebarCategory | SidebarBreak;

export type FlatSidebarEntry = {
  id: string;
  label: string;
  linkTo: LinkToInput;
  parents: string[];
};

/**
 * Flatten the sidebar tree into a linear list of doc entries, in their
 * declared order. Used by DocFooter to compute prev/next links.
 */
export function flattenSidebar(
  nodes: readonly SidebarNode[] | undefined,
  locale: string | null,
): FlatSidebarEntry[] {
  const out: FlatSidebarEntry[] = [];
  walk(nodes ?? [], locale, [], out);
  return out;
}

function walk(
  nodes: readonly SidebarNode[],
  locale: string | null,
  parents: string[],
  out: FlatSidebarEntry[],
): void {
  for (const node of nodes) {
    if (node.kind === 'doc') {
      out.push({
        id: node.id,
        label: node.label,
        linkTo: docsLink(node.id, locale),
        parents,
      });
    } else if (node.kind === 'category') {
      walk(node.items, locale, [...parents, node.label], out);
    }
  }
}

export function findSidebarIndex(
  flat: readonly FlatSidebarEntry[],
  slug: string,
): number {
  return flat.findIndex((e) => e.id === slug);
}
