import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://analogjs.org',
  integrations: [
    starlight({
      title: 'Analog',
      tagline: 'The fullstack Angular meta-framework',
      logo: {
        src: './public/img/logos/analog-logo.svg',
      },
      social: {
        github: 'https://github.com/analogjs/analog',
        discord: 'https://chat.analogjs.org/',
      },
      editLink: {
        baseUrl:
          'https://github.com/analogjs/analog/edit/main/apps/docs-app-starlight/',
      },
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://analogjs.org/img/analog-banner.png',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:image',
            content: 'https://analogjs.org/img/analog-banner.png',
          },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        { label: 'Introduction', link: '/introduction/' },
        { label: 'Getting Started', link: '/getting-started/' },
        {
          label: 'Core Concepts',
          items: [
            {
              label: 'Routing',
              items: [
                { label: 'Overview', link: '/features/routing/overview/' },
                {
                  label: 'Route Metadata',
                  link: '/features/routing/metadata/',
                },
                { label: 'Content Routes', link: '/features/routing/content/' },
                { label: 'Middleware', link: '/features/routing/middleware/' },
              ],
            },
            {
              label: 'API Routes',
              items: [
                { label: 'Overview', link: '/features/api/overview/' },
                { label: 'Websockets', link: '/features/api/websockets/' },
                {
                  label: 'OG Image Generation',
                  link: '/features/api/og-image-generation/',
                },
              ],
            },
            {
              label: 'Data Fetching',
              items: [
                {
                  label: 'Overview',
                  link: '/features/data-fetching/overview/',
                },
                {
                  label: 'Server-Side Data Fetching',
                  link: '/features/data-fetching/server-side-data-fetching/',
                },
              ],
            },
            {
              label: 'Static Site Generation',
              items: [
                {
                  label: 'Overview',
                  link: '/features/server/static-site-generation/',
                },
              ],
            },
            {
              label: 'Server Side Rendering',
              items: [
                {
                  label: 'Overview',
                  link: '/features/server/server-side-rendering/',
                },
              ],
            },
            { label: 'Form Actions', link: '/guides/forms/' },
            {
              label: 'Code Generation',
              items: [
                {
                  label: 'Overview',
                  link: '/features/generation/code-generation/',
                },
              ],
            },
          ],
        },
        {
          label: 'Deployment',
          items: [
            { label: 'Overview', link: '/features/deployment/overview/' },
            { label: 'Providers', link: '/features/deployment/providers/' },
          ],
        },
        {
          label: 'Testing',
          items: [
            { label: 'Overview', link: '/features/testing/overview/' },
            { label: 'Adding Vitest', link: '/features/testing/vitest/' },
          ],
        },
        {
          label: 'Updating',
          items: [{ label: 'Overview', link: '/features/updating/overview/' }],
        },
        {
          label: 'Guides',
          items: [
            {
              label: 'Migrating an Angular app to Analog',
              link: '/guides/migrating/',
            },
            {
              label: 'Building an Angular library',
              link: '/guides/libraries/',
            },
            { label: 'Version Compatibility', link: '/guides/compatibility/' },
          ],
        },
        {
          label: 'Integrations',
          items: [
            { label: 'Nx', link: '/integrations/nx/' },
            { label: 'Astro', link: '/packages/astro-angular/overview/' },
            { label: 'Vite', link: '/packages/vite-plugin-angular/overview/' },
            { label: 'Nitro', link: '/packages/vite-plugin-nitro/overview/' },
            {
              label: 'Angular Material',
              link: '/integrations/angular-material/',
            },
            { label: 'Ionic Framework', link: '/integrations/ionic/' },
            { label: 'Storybook', link: '/integrations/storybook/' },
          ],
        },
        { label: 'Contributors', link: '/contributors/' },
        { label: 'Support', link: '/support/' },
      ],
    }),
  ],
});
