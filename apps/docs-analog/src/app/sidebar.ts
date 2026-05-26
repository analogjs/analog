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

/**
 * Hand-curated navigation tree, ported from
 * apps/docs-app/sidebars.js. Order and labels are intentional and may
 * diverge from the on-disk directory layout. Add nodes as content files
 * land in src/content/ (Phase 4+).
 */
export const sidebar: SidebarNode[] = [
  { kind: 'doc', id: 'introduction', label: 'Introduction' },
  { kind: 'doc', id: 'getting-started', label: 'Getting Started' },
  {
    kind: 'category',
    label: 'Core Concepts',
    items: [
      {
        kind: 'category',
        label: 'Routing',
        items: [
          {
            kind: 'doc',
            id: 'features/routing/overview',
            label: 'Overview',
          },
        ],
      },
    ],
  },
];

export type FlatSidebarEntry = {
  id: string;
  label: string;
  href: string;
  categoryPath: string[];
};

/**
 * Walks the sidebar in display order and emits one entry per doc, with
 * its breadcrumb of containing categories. Used for prev/next links.
 */
export function flattenSidebar(
  nodes: readonly SidebarNode[] = sidebar,
  locale: string | null = null,
  categoryPath: string[] = [],
): FlatSidebarEntry[] {
  const localePrefix = locale ? `/${locale}` : '';
  const out: FlatSidebarEntry[] = [];
  for (const node of nodes) {
    if (node.kind === 'doc') {
      out.push({
        id: node.id,
        label: node.label,
        href: `${localePrefix}/docs/${node.id}`,
        categoryPath,
      });
    } else {
      out.push(
        ...flattenSidebar(node.items, locale, [...categoryPath, node.label]),
      );
    }
  }
  return out;
}

export function findSidebarIndex(
  flat: readonly FlatSidebarEntry[],
  id: string,
): number {
  return flat.findIndex((e) => e.id === id);
}
