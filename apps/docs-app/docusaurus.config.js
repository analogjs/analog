// @ts-check

import { themes } from 'prism-react-renderer';
themes.nightOwl['plain'].backgroundColor = '#0a1429';

const organizationName = 'analogjs';
const projectName = 'analog';
const title = 'Analog';
const url = 'https://analogjs.org';

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
  plugins: [],
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
