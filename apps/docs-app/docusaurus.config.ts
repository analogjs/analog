// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

import { themes } from 'prism-react-renderer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
themes.nightOwl['plain'].backgroundColor = '#0a1429';
const organizationName = 'analogjs';
const projectName = 'analog';
const title = 'Analog';
const url = 'https://analogjs.org';
const DOCUSAURUS_BASE_URL = process.env.DOCUSAURUS_BASE_URL ?? '/docs';

const config: Config = {
  baseUrl: '/',
  // Performance improvements with Docusaurus Faster and v4 future flags
  future: {
    experimental_faster: true,
    v4: true,
  },
  // Enable mermaid diagrams
  markdown: {
    mermaid: true,
  },
  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'pt-br', 'tr', 'ko', 'zh-hans', 'de'],
    localeConfigs: {
      en: {
        label: 'English',
      },
      es: {
        label: 'Español',
      },
      fr: {
        label: 'Français',
      },
      'pt-br': {
        label: 'Português (Brasil)',
        htmlLang: 'pt-BR',
      },
      tr: {
        label: 'Türkçe',
      },
      ko: {
        label: '한국어',
      },
      'zh-hans': {
        label: '简体中文',
        htmlLang: 'zh-Hans',
      },
      de: {
        label: 'Deutsch',
      },
    },
  },
  favicon: 'img/favicon.ico',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  organizationName,
  plugins: [
    // Rsdoctor plugin for build analysis (enabled via RSDOCTOR=true environment variable)
    process.env.RSDOCTOR === 'true' && [
      'rsdoctor',
      {
        /* options */
      },
    ],
    // Adapted from https://github.com/prisma/docs/blob/22208d52e4168028dbbe8b020b10682e6b526e50/docusaurus.config.ts
    async function pluginLlmsTxt(context) {
      return {
        name: 'llms-txt-plugin',
        loadContent: async () => {
          const { siteDir } = context;
          const contentDir = path.join(siteDir, 'docs');
          const allMdx = [];
          // recursive function to get all mdx files
          const getMdFiles = async (dir) => {
            const entries = await fs.promises.readdir(dir, {
              withFileTypes: true,
            });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                await getMdFiles(fullPath);
              } else if (entry.name.endsWith('.md')) {
                const content = await fs.promises.readFile(fullPath, 'utf8');
                // extract title from frontmatter if it exists
                const titleMatch = content.match(/^#\s(.*?)$/m);
                const title = titleMatch ? titleMatch[1] : '';
                // Get the relative path for URL construction
                const relativePath = path.relative(contentDir, fullPath);
                // Convert file path to URL path by:
                // 1. Removing numeric prefixes (like 100-, 01-, etc.)
                // 2. Removing the .md extension
                let urlPath = relativePath
                  .replace(/^\d+-/, '')
                  .replace(/\/\d+-/g, '/')
                  .replace(/index\.md$/, '')
                  .replace(/\.md$/, '');
                // Construct the full URL
                const fullUrl = `https://analogjs.org/docs/${urlPath}`;
                // strip frontmatter
                const contentWithoutFrontmatter = content.replace(
                  /^---\n[\s\S]*?\n---\n/,
                  '',
                );
                // combine title and content with URL
                const contentWithTitle = title
                  ? `# ${title}\n\nURL: ${fullUrl}\n${contentWithoutFrontmatter}`
                  : contentWithoutFrontmatter;
                allMdx.push(contentWithTitle);
              }
            }
          };
          await getMdFiles(contentDir);
          return { allMdx };
        },
        postBuild: async ({ content, routes, outDir }) => {
          const { allMdx } = content;
          // Write concatenated MDX content
          const concatenatedPath = path.join(outDir, 'llms-full.txt');
          await fs.promises.writeFile(
            concatenatedPath,
            allMdx.join('\n---\n\n'),
          );
          // we need to dig down several layers:
          // find PluginRouteConfig marked by plugin.name === "docusaurus-plugin-content-docs"
          const docsPluginRouteConfig = routes.filter(
            (route) => route.plugin.name === 'docusaurus-plugin-content-docs',
          )[0];
          // docsPluginRouteConfig has a routes property has a record with the path "/" that contains all docs routes.
          const allDocsRouteConfig = docsPluginRouteConfig.routes?.filter(
            (route) => route.path === DOCUSAURUS_BASE_URL,
          )[0];
          // A little type checking first
          if (!allDocsRouteConfig?.props?.version) {
            return;
          }
          // this route config has a `props` property that contains the current documentation.
          const currentVersionDocsRoutes =
            allDocsRouteConfig.props.version.docs;
          // for every single docs route we now parse a path (which is the key) and a title
          const docsRecords = Object.entries(currentVersionDocsRoutes)
            .filter(([path, rec]) => !!rec.title && !!path)
            .map(([path, record]) => {
              return `- [${record.title}](${url}${DOCUSAURUS_BASE_URL}/${path.replace('/index', '')}): ${record.description || record.title}`;
            });
          // Build up llms.txt file
          const llmsTxt = `# ${context.siteConfig.title}\n\n## Docs\n\n${docsRecords.join('\n')}\n`;
          // Write llms.txt file
          const llmsTxtPath = path.join(outDir, 'llms.txt');
          await fs.promises.writeFile(llmsTxtPath, llmsTxt);
        },
      };
    },
  ],
  presets: [
    [
      'classic',
      {
        blog: false,
        docs: {
          editUrl: `https://github.com/${organizationName}/${projectName}/edit/main/apps/docs-app`,
          sidebarPath: join(__dirname, 'sidebars.ts'),
        },
        theme: {
          customCss: join(__dirname, 'src/css/custom.css'),
        },
        svgr: {
          svgrConfig: {
            // SVGR options for better SVG optimization
            svgoConfig: {
              plugins: [
                {
                  name: 'preset-default',
                  params: {
                    overrides: {
                      removeViewBox: false,
                    },
                  },
                },
              ],
            },
          },
        },
      } satisfies Preset.Options,
    ],
  ],
  // Add mermaid theme
  themes: ['@docusaurus/theme-mermaid'],
  projectName,
  tagline: 'The fullstack Angular meta-framework',
  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    metadata: [
      {
        name: 'twitter:image',
        content: 'https://analogjs.org/img/analog-banner.png',
      },
    ],
    image: 'img/analog-banner.png',
    footer: {
      logo: {
        alt: 'Analog logo',
        href: '/',
        src: 'img/logos/analog-logo.svg',
      },
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Introduction',
              to: 'docs',
            },
            {
              label: 'Getting Started',
              to: 'docs/getting-started',
            },
          ],
        },
        {
          title: 'Open source',
          items: [
            {
              label: 'Contributors',
              to: 'docs/contributors',
            },
            {
              label: 'Contributing',
              to: 'docs/contributing',
            },
            {
              label: 'Sponsoring',
              to: 'docs/sponsoring',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: `https://github.com/${organizationName}/${projectName}`,
            },
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/analogjs',
            },
          ],
        },
      ],
      copyright: `
          Copyright © 2022-${new Date().getFullYear()} Analog. Licensed under MIT.
        `,
    },
    navbar: {
      title,
      hideOnScroll: true,
      logo: {
        alt: 'Analog logo',
        src: 'img/logos/analog-logo.svg',
      },
      items: [
        {
          activeBasePath: 'docs',
          label: 'Docs',
          position: 'left',
          to: 'docs',
        },
        {
          activeBasePath: 'docs',
          label: 'Support',
          position: 'left',
          to: 'docs/support',
        },
        {
          href: `https://github.com/${organizationName}/${projectName}`,
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://chat.analogjs.org',
          label: 'Discord',
          position: 'right',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
      ],
    },
    prism: {
      defaultLanguage: 'typescript',
      theme: themes.nightOwlLight,
      darkTheme: themes.nightOwl,
      additionalLanguages: ['toml', 'json', 'bash'],
    },
    // Mermaid diagram configuration
    mermaid: {
      theme: { light: 'neutral', dark: 'forest' },
      options: {
        maxTextSize: 50,
      },
    },
    algolia: {
      appId: '8W3CAMYOQF',
      apiKey: '650d723674c8cd38658add35fb9433e3',
      indexName: 'analogjs',
    },
  } satisfies Preset.ThemeConfig,
  title,
  // GitHub Pages adds a trailing slash to Docusaurus URLs by default.
  trailingSlash: false,
  url,
};

export default config;
