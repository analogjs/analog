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
 * Hand-curated navigation tree, ported verbatim from
 * apps/docs-app/sidebars.js. Order and labels are intentional and
 * deliberately diverge from the on-disk directory layout
 * (e.g. Form Actions sits under Core Concepts but the file lives in
 * guides/, and Integrations mixes integrations/ with packages/).
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
          { kind: 'doc', id: 'features/routing/overview', label: 'Overview' },
          {
            kind: 'doc',
            id: 'features/routing/metadata',
            label: 'Route Metadata',
          },
          {
            kind: 'doc',
            id: 'features/routing/content',
            label: 'Content Routes',
          },
          {
            kind: 'doc',
            id: 'features/routing/middleware',
            label: 'Middleware',
          },
        ],
      },
      {
        kind: 'category',
        label: 'API Routes',
        items: [
          { kind: 'doc', id: 'features/api/overview', label: 'Overview' },
          { kind: 'doc', id: 'features/api/websockets', label: 'Websockets' },
          {
            kind: 'doc',
            id: 'features/api/og-image-generation',
            label: 'OG Image Generation',
          },
        ],
      },
      {
        kind: 'category',
        label: 'Data Fetching',
        items: [
          {
            kind: 'doc',
            id: 'features/data-fetching/overview',
            label: 'Overview',
          },
          {
            kind: 'doc',
            id: 'features/data-fetching/server-side-data-fetching',
            label: 'Server-Side Data Fetching',
          },
        ],
      },
      {
        kind: 'category',
        label: 'Static Site Generation',
        items: [
          {
            kind: 'doc',
            id: 'features/server/static-site-generation',
            label: 'Overview',
          },
        ],
      },
      {
        kind: 'category',
        label: 'Server Side Rendering',
        items: [
          {
            kind: 'doc',
            id: 'features/server/server-side-rendering',
            label: 'Overview',
          },
        ],
      },
      {
        kind: 'category',
        label: 'Internationalization (i18n)',
        items: [
          { kind: 'doc', id: 'features/i18n/overview', label: 'Overview' },
        ],
      },
      { kind: 'doc', id: 'guides/forms', label: 'Form Actions' },
      {
        kind: 'category',
        label: 'Code Generation',
        items: [
          {
            kind: 'doc',
            id: 'features/generation/code-generation',
            label: 'Overview',
          },
        ],
      },
    ],
  },
  {
    kind: 'category',
    label: 'Deployment',
    items: [
      { kind: 'doc', id: 'features/deployment/overview', label: 'Overview' },
      { kind: 'doc', id: 'features/deployment/providers', label: 'Providers' },
    ],
  },
  {
    kind: 'category',
    label: 'Testing w/Vitest',
    items: [
      { kind: 'doc', id: 'features/testing/overview', label: 'Overview' },
      {
        kind: 'doc',
        id: 'features/testing/vitest',
        label: 'Setting Up Vitest',
      },
    ],
  },
  {
    kind: 'category',
    label: 'Updating',
    items: [
      { kind: 'doc', id: 'features/updating/overview', label: 'Overview' },
    ],
  },
  {
    kind: 'category',
    label: 'Guides',
    items: [
      {
        kind: 'doc',
        id: 'guides/migrating',
        label: 'Migrating an Angular app to Analog',
      },
      {
        kind: 'doc',
        id: 'guides/libraries',
        label: 'Building an Angular library',
      },
      {
        kind: 'doc',
        id: 'guides/compatibility',
        label: 'Version Compatibility',
      },
    ],
  },
  {
    kind: 'category',
    label: 'Integrations',
    items: [
      { kind: 'doc', id: 'integrations/nx/index', label: 'Nx' },
      { kind: 'doc', id: 'packages/astro-angular/overview', label: 'Astro' },
      {
        kind: 'doc',
        id: 'packages/vite-plugin-angular/overview',
        label: 'Vite',
      },
      {
        kind: 'doc',
        id: 'packages/vite-plugin-nitro/overview',
        label: 'Nitro',
      },
      {
        kind: 'doc',
        id: 'integrations/angular-material/index',
        label: 'Angular Material',
      },
      { kind: 'doc', id: 'integrations/ionic/index', label: 'Ionic Framework' },
      { kind: 'doc', id: 'integrations/storybook/index', label: 'Storybook' },
    ],
  },
  {
    kind: 'category',
    label: 'AI',
    items: [{ kind: 'doc', id: 'integrations/ai/index', label: 'Overview' }],
  },
  { kind: 'doc', id: 'contributors', label: 'Contributors' },
  { kind: 'doc', id: 'support', label: 'Support' },
];

export type FlatSidebarEntry = {
  id: string;
  label: string;
  href: string;
  categoryPath: string[];
};

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
