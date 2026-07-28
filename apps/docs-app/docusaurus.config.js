// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import { themes } from 'prism-react-renderer';
themes.nightOwl['plain'].backgroundColor = '#0a1429';

const organizationName = 'analogjs';
const projectName = 'analog';
const title = 'Analog';
const url = 'https://analogjs.org';

const DOCUSAURUS_BASE_URL = process.env.DOCUSAURUS_BASE_URL ?? '/docs';

/** @type {import('@docusaurus/types').Config} */
const config = {
  baseUrl: '/',
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
    // Adapted from https://github.com/prisma/docs/blob/22208d52e4168028dbbe8b020b10682e6b526e50/docusaurus.config.ts
    async function pluginLlmsTxt(context) {
      return {
        name: 'llms-txt-plugin',
        loadContent: async () => {
          const { siteDir } = context;
          const contentDir = path.join(siteDir, 'docs');
          const allMdx = [];
          const mdPages = [];

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

                // strip frontmatter
                const frontmatterMatch = content.match(
                  /^---\n([\s\S]*?)\n---\n/,
                );
                const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
                const contentWithoutFrontmatter = content.replace(
                  /^---\n[\s\S]*?\n---\n/,
                  '',
                );

                // Convert file path to URL path by:
                // 1. Honoring an explicit frontmatter `slug`
                // 2. Removing numeric prefixes (like 100-, 01-, etc.)
                // 3. Removing the index/.md suffix and any trailing slash
                const slugMatch = frontmatter.match(/^slug:\s*(\S+)\s*$/m);
                const urlPath = (
                  slugMatch
                    ? slugMatch[1]
                    : relativePath
                        .replace(/^\d+-/, '')
                        .replace(/\/\d+-/g, '/')
                        .replace(/index\.md$/, '')
                        .replace(/\.md$/, '')
                )
                  .replace(/^\//, '')
                  .replace(/\/$/, '');

                // Construct the full URL (pages are served without a trailing
                // slash, e.g. /docs/integrations/ai)
                const fullUrl = urlPath
                  ? `https://analogjs.org/docs/${urlPath}`
                  : 'https://analogjs.org/docs/';

                // combine title and content with URL, dropping the source H1
                // the title was derived from so it isn't emitted twice
                const body = title
                  ? contentWithoutFrontmatter
                      .replace(/^#\s.*\r?\n/m, '')
                      .trimStart()
                  : contentWithoutFrontmatter;
                const contentWithTitle = title
                  ? `# ${title}\n\nURL: ${fullUrl}\n\n${body}`
                  : contentWithoutFrontmatter;

                allMdx.push(contentWithTitle);

                // Mirror the page as raw Markdown at its `.md` URL so agents can
                // fetch a single page (e.g. /docs/features/routing/overview.md)
                const mdOutputPath = urlPath
                  ? path.join('docs', `${urlPath}.md`)
                  : 'docs.md';

                mdPages.push({
                  outputPath: mdOutputPath,
                  content: contentWithTitle,
                });
              }
            }
          };

          await getMdFiles(contentDir);
          return { allMdx, mdPages };
        },
        postBuild: async ({ content, routes, outDir }) => {
          const { allMdx, mdPages } = content;

          // Write concatenated MDX content
          const concatenatedPath = path.join(outDir, 'llms-full.txt');
          await fs.promises.writeFile(
            concatenatedPath,
            allMdx.join('\n---\n\n'),
          );

          // Write per-page Markdown files alongside the built HTML so each docs
          // page is retrievable as raw Markdown at its `.md` URL.
          const outputRoot = path.resolve(outDir);
          await Promise.all(
            mdPages.map(async ({ outputPath, content: pageContent }) => {
              const fullPath = path.resolve(outputRoot, outputPath);

              // Guard against a frontmatter `slug` escaping the build output
              const relativeOutputPath = path.relative(outputRoot, fullPath);
              if (
                relativeOutputPath === '..' ||
                relativeOutputPath.startsWith(`..${path.sep}`) ||
                path.isAbsolute(relativeOutputPath)
              ) {
                throw new Error(
                  `Refusing to write outside build output: ${outputPath}`,
                );
              }

              await fs.promises.mkdir(path.dirname(fullPath), {
                recursive: true,
              });
              await fs.promises.writeFile(fullPath, pageContent);
            }),
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

          // for every single docs route we now parse a path (which is the key)
          // and a title, grouping records by their top-level section
          const docsRecords = [];
          const sectionRecords = {};
          for (const [routePath, record] of Object.entries(
            currentVersionDocsRoutes,
          )) {
            if (!record.title || !routePath) {
              continue;
            }

            const line = `- [${record.title}](${url}${DOCUSAURUS_BASE_URL}/${routePath.replace('/index', '')}): ${record.description || record.title}`;
            docsRecords.push(line);

            const section = routePath.split('/')[0];
            (sectionRecords[section] ??= []).push(line);
          }

          // Build up the top-level llms.txt file
          const llmsTxt = `# ${context.siteConfig.title}\n\n## Docs\n\n${docsRecords.join('\n')}\n`;

          // Write llms.txt file
          const llmsTxtPath = path.join(outDir, 'llms.txt');
          await fs.promises.writeFile(llmsTxtPath, llmsTxt);

          // Write a scoped llms.txt for each multi-page section so a retrieval
          // pipeline can pull just the relevant section (e.g.
          // /docs/features/llms.txt)
          await Promise.all(
            Object.entries(sectionRecords)
              .filter(([, records]) => records.length > 1)
              .map(async ([section, records]) => {
                const sectionTxt = `# ${context.siteConfig.title}\n\n## ${section}\n\n${records.join('\n')}\n`;
                const sectionPath = path.join(
                  outDir,
                  'docs',
                  section,
                  'llms.txt',
                );
                await fs.promises.mkdir(path.dirname(sectionPath), {
                  recursive: true,
                });
                await fs.promises.writeFile(sectionPath, sectionTxt);
              }),
          );
        },
      };
    },
  ],
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        blog: false,
        docs: {
          editUrl: `https://github.com/${organizationName}/${projectName}/edit/main/apps/docs-app`,
          sidebarPath: require.resolve('./sidebars.js'),
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        gtag: {
          trackingID: 'G-8S6ZF9V3Q6',
          anonymizeIP: true,
        },
      }),
    ],
  ],
  projectName,
  tagline: 'The fullstack Angular meta-framework',
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
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
              {
                label: 'llms.txt',
                href: 'https://analogjs.org/llms.txt',
              },
              {
                label: 'llms-full.txt',
                href: 'https://analogjs.org/llms-full.txt',
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
      algolia: {
        appId: '8W3CAMYOQF',
        apiKey: '650d723674c8cd38658add35fb9433e3',
        indexName: 'analogjs',
      },
    }),
  title,
  // GitHub Pages adds a trailing slash to Docusaurus URLs by default.
  trailingSlash: false,
  url,
};

module.exports = config;
