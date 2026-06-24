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

export type SidebarNode = SidebarDoc | SidebarCategory;

export type FlatSidebarEntry = {
  id: string;
  label: string;
  href: string;
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
  walk(nodes ?? [], locale, out);
  return out;
}

function walk(
  nodes: readonly SidebarNode[],
  locale: string | null,
  out: FlatSidebarEntry[],
): void {
  for (const node of nodes) {
    if (node.kind === 'doc') {
      const href = locale ? `/${locale}/docs/${node.id}` : `/docs/${node.id}`;
      out.push({ id: node.id, label: node.label, href });
    } else {
      walk(node.items, locale, out);
    }
  }
}

export function findSidebarIndex(
  flat: readonly FlatSidebarEntry[],
  slug: string,
): number {
  return flat.findIndex((e) => e.id === slug);
}
