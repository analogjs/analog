import type { SidebarNode } from '@analogjs/content/docs';

/**
 * Hand-curated navigation tree, ported verbatim from
 * apps/docs-app/sidebars.js. Order is intentional and deliberately
 * diverges from the on-disk directory layout (e.g. Form Actions sits
 * under Core Concepts but the file lives in guides/, and Integrations
 * mixes integrations/ with packages/).
 *
 * Exposed as a factory so the $localize labels resolve against
 * translations loaded at app bootstrap, not at module load (when
 * translations aren't yet available).
 */
export function getSidebar(): SidebarNode[] {
  return [
    {
      kind: 'doc',
      id: 'introduction',
      label: $localize`:@@sidebar.introduction:Introduction`,
    },
    {
      kind: 'doc',
      id: 'getting-started',
      label: $localize`:@@sidebar.getting-started:Getting Started`,
    },
    {
      kind: 'category',
      label: $localize`:@@sidebar.core-concepts:Core Concepts`,
      items: [
        {
          kind: 'category',
          label: $localize`:@@sidebar.routing:Routing`,
          items: [
            {
              kind: 'doc',
              id: 'features/routing/overview',
              label: $localize`:@@sidebar.overview:Overview`,
            },
            {
              kind: 'doc',
              id: 'features/routing/metadata',
              label: $localize`:@@sidebar.route-metadata:Route Metadata`,
            },
            {
              kind: 'doc',
              id: 'features/routing/content',
              label: $localize`:@@sidebar.content-routes:Content Routes`,
            },
            {
              kind: 'doc',
              id: 'features/routing/middleware',
              label: $localize`:@@sidebar.middleware:Middleware`,
            },
          ],
        },
        {
          kind: 'category',
          label: $localize`:@@sidebar.api-routes:API Routes`,
          items: [
            {
              kind: 'doc',
              id: 'features/api/overview',
              label: $localize`:@@sidebar.overview:Overview`,
            },
            {
              kind: 'doc',
              id: 'features/api/websockets',
              label: $localize`:@@sidebar.websockets:Websockets`,
            },
            {
              kind: 'doc',
              id: 'features/api/og-image-generation',
              label: $localize`:@@sidebar.og-image-generation:OG Image Generation`,
            },
          ],
        },
        {
          kind: 'category',
          label: $localize`:@@sidebar.data-fetching:Data Fetching`,
          items: [
            {
              kind: 'doc',
              id: 'features/data-fetching/overview',
              label: $localize`:@@sidebar.overview:Overview`,
            },
            {
              kind: 'doc',
              id: 'features/data-fetching/server-side-data-fetching',
              label: $localize`:@@sidebar.server-side-data-fetching:Server-Side Data Fetching`,
            },
          ],
        },
        {
          kind: 'category',
          label: $localize`:@@sidebar.ssg:Static Site Generation`,
          items: [
            {
              kind: 'doc',
              id: 'features/server/static-site-generation',
              label: $localize`:@@sidebar.overview:Overview`,
            },
          ],
        },
        {
          kind: 'category',
          label: $localize`:@@sidebar.ssr:Server Side Rendering`,
          items: [
            {
              kind: 'doc',
              id: 'features/server/server-side-rendering',
              label: $localize`:@@sidebar.overview:Overview`,
            },
          ],
        },
        {
          kind: 'category',
          label: $localize`:@@sidebar.i18n:Internationalization (i18n)`,
          items: [
            {
              kind: 'doc',
              id: 'features/i18n/overview',
              label: $localize`:@@sidebar.overview:Overview`,
            },
          ],
        },
        {
          kind: 'doc',
          id: 'guides/forms',
          label: $localize`:@@sidebar.form-actions:Form Actions`,
        },
        {
          kind: 'category',
          label: $localize`:@@sidebar.code-generation:Code Generation`,
          items: [
            {
              kind: 'doc',
              id: 'features/generation/code-generation',
              label: $localize`:@@sidebar.overview:Overview`,
            },
          ],
        },
      ],
    },
    {
      kind: 'category',
      label: $localize`:@@sidebar.deployment:Deployment`,
      items: [
        {
          kind: 'doc',
          id: 'features/deployment/overview',
          label: $localize`:@@sidebar.overview:Overview`,
        },
        {
          kind: 'doc',
          id: 'features/deployment/providers',
          label: $localize`:@@sidebar.providers:Providers`,
        },
      ],
    },
    {
      kind: 'category',
      label: $localize`:@@sidebar.testing-vitest:Testing w/Vitest`,
      items: [
        {
          kind: 'doc',
          id: 'features/testing/overview',
          label: $localize`:@@sidebar.overview:Overview`,
        },
        {
          kind: 'doc',
          id: 'features/testing/vitest',
          label: $localize`:@@sidebar.setting-up-vitest:Setting Up Vitest`,
        },
      ],
    },
    {
      kind: 'category',
      label: $localize`:@@sidebar.updating:Updating`,
      items: [
        {
          kind: 'doc',
          id: 'features/updating/overview',
          label: $localize`:@@sidebar.overview:Overview`,
        },
      ],
    },
    {
      kind: 'category',
      label: $localize`:@@sidebar.guides:Guides`,
      items: [
        {
          kind: 'doc',
          id: 'guides/migrating',
          label: $localize`:@@sidebar.migrating:Migrating an Angular app to Analog`,
        },
        {
          kind: 'doc',
          id: 'guides/libraries',
          label: $localize`:@@sidebar.libraries:Building an Angular library`,
        },
        {
          kind: 'doc',
          id: 'guides/angular-compilation',
          label: $localize`:@@sidebar.angular-compilation:Angular Compilation`,
        },
        {
          kind: 'doc',
          id: 'guides/compatibility',
          label: $localize`:@@sidebar.compatibility:Version Compatibility`,
        },
      ],
    },
    {
      kind: 'category',
      label: $localize`:@@sidebar.integrations:Integrations`,
      items: [
        {
          kind: 'doc',
          id: 'integrations/nx/index',
          label: $localize`:@@sidebar.nx:Nx`,
        },
        {
          kind: 'doc',
          id: 'packages/astro-angular/overview',
          label: $localize`:@@sidebar.astro:Astro`,
        },
        {
          kind: 'doc',
          id: 'packages/vite-plugin-angular/overview',
          label: $localize`:@@sidebar.vite:Vite`,
        },
        {
          kind: 'doc',
          id: 'packages/vite-plugin-nitro/overview',
          label: $localize`:@@sidebar.nitro:Nitro`,
        },
        {
          kind: 'doc',
          id: 'integrations/angular-material/index',
          label: $localize`:@@sidebar.angular-material:Angular Material`,
        },
        {
          kind: 'doc',
          id: 'integrations/ionic/index',
          label: $localize`:@@sidebar.ionic:Ionic Framework`,
        },
        {
          kind: 'doc',
          id: 'integrations/storybook/index',
          label: $localize`:@@sidebar.storybook:Storybook`,
        },
      ],
    },
    {
      kind: 'category',
      label: $localize`:@@sidebar.ai:AI`,
      items: [
        {
          kind: 'doc',
          id: 'integrations/ai/index',
          label: $localize`:@@sidebar.overview:Overview`,
        },
      ],
    },
    {
      kind: 'doc',
      id: 'contributors',
      label: $localize`:@@sidebar.contributors:Contributors`,
    },
    {
      kind: 'doc',
      id: 'support',
      label: $localize`:@@sidebar.support:Support`,
    },
  ];
}
