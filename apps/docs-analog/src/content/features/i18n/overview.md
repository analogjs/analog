# Internationalization (i18n)

Analog supports runtime internationalization using Angular's built-in `$localize` system. This allows you to serve translated content with a single build, detecting the user's locale at runtime on both the server and client.

## Setup

### 1. Install `@angular/localize`

Add the `@angular/localize` package to your project:

```bash
npm install @angular/localize
```

### 2. Initialize `$localize`

Import the `$localize` polyfill before your application imports in both entry points, `src/main.ts` and `src/main.server.ts`:

```ts
import '@angular/localize/init';
```

### 3. Create a shared translation loader

Create translation files such as `src/i18n/fr.json` and `src/i18n/de.json`. Each file contains a message ID-to-string map:

```json
{
  "greeting": "Bonjour",
  "farewell": "Au revoir"
}
```

Export a loader from a module that does not import your application:

```ts
// src/i18n.ts
export default async function loadTranslations(locale: string) {
  switch (locale) {
    case 'fr':
      return (await import('./i18n/fr.json')).default;
    case 'de':
      return (await import('./i18n/de.json')).default;
    default:
      return {};
  }
}
```

The first entry in `locales` is the source language. Its messages are already in your templates, so the loader is not called for that locale.

### 4. Configure the platform

Configure your locales and the loader module's path in `vite.config.ts`:

```ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    analog({
      i18n: {
        defaultLocale: 'en',
        locales: ['en', 'fr', 'de'],
        loader: './src/i18n.ts',
      },
    }),
  ],
});
```

The loader path enables [locale workers](#concurrent-server-rendering) automatically for supported production Node builds, including prerendering.

### 5. Register the runtime provider

Pass the same loader function to `provideI18n()` for browser and development rendering:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';
import { provideI18n } from '@analogjs/router/i18n';
import loadTranslations from '../i18n';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(), provideI18n({ loader: loadTranslations })],
};
```

`provideI18n()` reads locales from the platform configuration, or accepts them explicitly:

| Property        | Type                                                                            | Description                                                                      |
| --------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `defaultLocale` | `string`                                                                        | Fallback locale; optional when configured in the platform                        |
| `locales`       | `string[]`                                                                      | Supported locales, with the source language first; optional with platform config |
| `loader`        | `(locale: string) => Promise<Record<string, string>> \| Record<string, string>` | Required function returning translations for a locale                            |

## Using Translations in Templates

Use Angular's `i18n` attribute to mark text for translation:

```html
<h1 i18n="@@greeting">Hello</h1>
<p i18n="@@farewell">Goodbye</p>
```

Or use `$localize` directly in component code:

```ts
@Component({
  selector: 'app-home',
  template: `<h1>{{ title }}</h1>`,
})
export class HomeComponent {
  title = $localize`:@@greeting:Hello`;
}
```

## Locale Detection

Analog detects the user's locale automatically in both SSR and client-only modes.

### Server-Side Rendering

During SSR, the locale is detected from the incoming request using two strategies, in order of priority:

1. **URL path prefix**: a locale prefix in the URL path (e.g., `/fr/about` resolves to `fr`)
2. **`Accept-Language` header**: the browser's preferred language from the request headers

### Client-Only Mode

When SSR is disabled (`ssr: false`), `provideI18n()` detects the locale from `window.location.pathname` by matching the first URL segment against the configured `locales` list. If no match is found, `defaultLocale` is used.

### Accessing the Current Locale

The detected locale is available through the `LOCALE` injection token. Inject it anywhere in your application:

```ts
@Component({
  selector: 'app-language-switcher',
  template: `<span>Current locale: {{ locale }}</span>`,
})
export class LanguageSwitcherComponent {
  locale = injectLocale();
}
```

## URL-Based Locale Routing

Locale detection chooses translations; it does not add locale segments to the file router. For `/en/about` and `/fr/about` to match a page, include that segment in your page structure.

### Explicit pages under `[locale]`

Use a dynamic `[locale]` directory when each URL has its own page component:

```text
src/app/pages/
├── index.page.ts
└── [locale]/
    ├── index.page.ts
    ├── about.page.ts
    └── products/
        └── [id].page.ts
```

| File                             | Route                   | Example URL       |
| -------------------------------- | ----------------------- | ----------------- |
| `index.page.ts`                  | `/`                     | `/`               |
| `[locale]/index.page.ts`         | `/:locale`              | `/fr`             |
| `[locale]/about.page.ts`         | `/:locale/about`        | `/fr/about`       |
| `[locale]/products/[id].page.ts` | `/:locale/products/:id` | `/fr/products/42` |

For example, the same about page renders in each locale:

```ts
// src/app/pages/[locale]/about.page.ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: `<h1 i18n="@@aboutTitle">About us</h1>`,
})
export default class AboutPage {}
```

Configure the same supported locales in the platform's `i18n` options and `provideI18n()`. A dynamic route parameter accepts any segment: `[locale]` alone does not restrict URLs to your supported languages. Add application route guards if unsupported prefixes should redirect or return a not-found page.

A componentless `[locale]` directory needs no layout file. If you add `[locale].page.ts` as a shared layout, import `RouterOutlet` from `@angular/router` and render `<router-outlet />` for its child pages.

### Catch-all content routes

For a content-driven site where one component resolves many slugs, use `[locale]/[...slug].page.ts`. It captures the remaining path, such as `/fr/guides/getting-started`, in one wildcard route. Your component must resolve the requested content and handle missing content; a catch-all does not create a separate component for each page. See [nested content routes](/docs/features/routing/content#hierarchical-nested-content) for the content-loading pattern.

For ordinary application pages such as checkout, account, and product details, prefer the explicit page structure above. You do not need a catch-all solely to enable localization.

### Redirecting the root URL

A common pattern is to redirect the root URL to the user's preferred locale:

```ts
// src/app/pages/index.page.ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { injectLocale } from '@analogjs/router/tokens';

@Component({
  template: '',
})
export default class IndexPage {
  constructor() {
    const router = inject(Router);
    const locale = injectLocale() ?? 'en';
    router.navigate([locale]);
  }
}
```

## Concurrent server rendering

Angular's `$localize` state is shared within a JavaScript context, so overlapping SSR requests in different locales can produce mixed-language pages. Locale workers isolate each language while keeping requests concurrent. Keep the usual `render(App, config)` server entry.

### Worker selection

The shared loader in [Setup](#setup) automatically enables workers when:

- The resolved Nitro preset is `node-server` and SSR is enabled.
- `i18n.loader` is configured with at least two locales.
- Progressive Angular streaming, WebSockets, and scheduled tasks are disabled.

Selection follows the deployment preset. To target a standalone Node server explicitly, set `nitro: { preset: 'node-server' }` in `analog()`.

| `i18n.workers` | Behavior                                                             |
| -------------- | -------------------------------------------------------------------- |
| Omitted        | Automatic when eligible; unsupported setups warn and fall back       |
| `false`        | Disables workers                                                     |
| `true`         | Requires a supported worker configuration; fails the build otherwise |

Existing configurations without `i18n.loader` are unchanged. To adopt workers, export your existing loader from a shared module, pass it to `provideI18n()`, and add its path to the platform configuration as shown in [Setup](#setup). Without workers, concurrent SSR requests in different locales remain unisolated.

### Deployment limits

- Each locale worker uses additional memory and initializes its own Nitro plugins.
- Workers use HTTP TCP. Terminate TLS at a reverse proxy; direct TLS and Unix sockets are unsupported. HTTP response streaming is supported.
- H3's `getRequestIP()` uses the incoming connection address from `event.context.clientAddress`. Forwarded headers are preserved, but behind a trusted reverse proxy, read its forwarded address explicitly: H3 gives `clientAddress` precedence.
- Shutdown drains requests for up to 30 seconds. An unexpected worker failure stops the server; use a process supervisor to restart it.

## Switching Locale at Runtime

Angular's `$localize` resolves translations at template evaluation time, so switching locale requires a full page navigation to re-evaluate all templates with the correct translations.

Use `injectSwitchLocale()` in your components. It reads the configured locales from `provideI18n()` automatically:

```ts
@Component({
  selector: 'app-language-switcher',
  template: `
    <button (click)="switchLang('en')">English</button>
    <button (click)="switchLang('fr')">Français</button>
    <button (click)="switchLang('de')">Deutsch</button>
    <p>Current: {{ locale }}</p>
  `,
})
export class LanguageSwitcherComponent {
  locale = injectLocale();
  switchLang = injectSwitchLocale();
}
```

Calling `switchLang('fr')` navigates from `/en/about` to `/fr/about` with a full page load. If no locale prefix exists in the current URL, the target locale is prepended.

### Low-Level: `loadTranslationsRuntime()`

If you need to update the `$localize` translation map without a navigation (e.g., preloading translations), use `loadTranslationsRuntime()`:

```ts
const translations = await fetch('/i18n/fr.json').then((r) => r.json());
loadTranslationsRuntime(translations);
```

:::info
`loadTranslationsRuntime()` updates the translation map in memory, but components that have already rendered will not re-render. Use `switchLocale()` or `injectSwitchLocale()` for a full locale switch.
:::

## Extracting Messages

Analog can extract i18n message IDs from your compiled build output. Enable extraction in the platform plugin options:

```ts
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      i18n: {
        defaultLocale: 'en',
        locales: ['en', 'fr', 'de'],
        extract: {
          format: 'json',
          outFile: 'src/i18n/messages.json',
        },
      },
    }),
  ],
}));
```

When `extract` is configured, a production build (`npm run build`) will scan the compiled JavaScript for `$localize` tagged templates and write a translation source file.

### Supported Formats

| Format   | Extension | Description                     |
| -------- | --------- | ------------------------------- |
| `json`   | `.json`   | Simple key-value JSON (default) |
| `xliff`  | `.xlf`    | XLIFF 1.2                       |
| `xliff2` | `.xlf`    | XLIFF 2.0                       |
| `xmb`    | `.xmb`    | XML Message Bundle              |

### Extraction with `@angular/localize/tools`

If `@angular/localize` is installed, Analog uses its `MessageExtractor` for accurate extraction with full source map support. If the package is not installed, a built-in regex-based extractor is used as a fallback.

For the best results, install `@angular/localize`:

```bash
npm install @angular/localize
```

### Using Extracted Messages

After extraction, use the generated file as a template for your translations. For example, with JSON format:

```json
// src/i18n/messages.json (generated)
{
  "greeting": "Hello",
  "farewell": "Goodbye"
}
```

Copy this file for each locale and translate the values:

```json
// src/i18n/fr.json
{
  "greeting": "Bonjour",
  "farewell": "Au revoir"
}
```

Then reference the translation files in your `provideI18n()` loader.

## Content i18n

Analog's content system supports locale-aware content resolution for blogs, docs, and other markdown content. Add `withLocale()` to your `provideContent()` configuration:

```ts
// src/app/app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(),
    provideI18n({
      defaultLocale: 'en',
      locales: ['en', 'fr', 'de'],
      loader: async (locale) => {
        const translations = await import(`../i18n/${locale}.json`);
        return translations.default;
      },
    }),
    provideContent(
      withMarkdownRenderer(),
      withLocale({ loadLocale: injectLocale }),
    ),
  ],
};
```

### Organizing Content by Locale

Use locale subdirectories under `src/content/`:

```
src/content/
  en/
    blog/
      my-post.md
      another-post.md
  fr/
    blog/
      my-post.md
      another-post.md
  blog/
    shared-post.md     ← no locale, shown for all locales
```

With this setup, `injectContentFiles()` and `injectContent()` automatically resolve to the correct locale:

```ts
// Blog list: returns only posts for the active locale
const posts = injectContentFiles<PostAttributes>((file) =>
  file.filename.includes('/blog/'),
);

// Blog detail: resolves /content/fr/blog/my-post.md when locale is 'fr'
const post$ = injectContent<PostAttributes>({
  param: 'slug',
  subdirectory: 'blog',
});
```

No locale-specific code is needed in components; the content APIs handle it internally.

### Frontmatter Locale Attribute

Alternatively, set the locale in frontmatter instead of using subdirectories:

```markdown
---
title: Mon article
locale: fr
slug: my-post
---
```

Files with a `locale` frontmatter attribute are filtered by that value. Files without a `locale` attribute and outside any locale subdirectory are treated as universal content and included for all locales.

### Prerendering Content Routes

Use `PrerenderContentDir` with locale-aware transforms:

```ts
analog({
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de'],
  },
  prerender: {
    routes: [
      {
        contentDir: '/src/content',
        transform: (file) => {
          // file.path includes the locale: '/src/content/fr/blog'
          const segments = file.path.split('/').filter(Boolean);
          const localeIndex = segments.indexOf('content') + 1;
          const locale = segments[localeIndex];
          const rest = segments.slice(localeIndex + 1).join('/');
          return `/${locale}/${rest}/${file.attributes['slug'] || file.name}`;
        },
      },
    ],
  },
});
```

## Development

Development uses the existing SSR path rather than fixed-locale workers. The Analog dev server provides:

- **`<html lang>` injection**: the `lang` attribute on the `<html>` tag is set automatically based on the detected locale for each request.
- **Translation file HMR**: editing translation files in `i18n/` directories (`.json`, `.xlf`, `.xmb`, `.arb`) triggers an automatic page reload so changes are reflected immediately.
- **Locale-prefixed routes**: URLs like `http://localhost:5173/fr/about` work when your file routes include the locale segment, as shown above. The SSR middleware detects the locale and loads the correct translations.

## Prerendering

When `i18n` is configured, prerendering generates locale-prefixed variants for each route. Locale workers support parallel prerendering and crawling; configure concurrency with `nitro.prerender.concurrency`. With `static: true`, workers run only during the build and the deployed output needs no Node server.

```ts
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      i18n: {
        defaultLocale: 'en',
        locales: ['en', 'fr', 'de'],
      },
      prerender: {
        routes: ['/', '/about', '/contact'],
        sitemap: {
          host: 'https://example.com',
        },
      },
    }),
  ],
}));
```

This configuration will:

1. **Expand routes.** Each route is prerendered for every locale: `/en/about`, `/fr/about`, `/de/about`, etc. The unprefixed routes are also kept for the default locale.
2. **Set `<html lang>`.** Each prerendered page receives the correct `lang` attribute (e.g., `<html lang="fr">`).
3. **Generate hreflang links in the sitemap.** The sitemap includes `<xhtml:link rel="alternate" hreflang="...">` entries for each locale variant, plus an `x-default` entry pointing to the default locale.

## Platform Configuration

Configure `i18n` in `analog()`:

| Property        | Type                  | Description                                                                                          |
| --------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `defaultLocale` | `string`              | Locale used when no supported locale is selected                                                     |
| `locales`       | `string[]`            | Supported locales; the first is the source language                                                  |
| `loader`        | `string`              | Optional translation-loader module path relative to the app root; enables automatic worker selection |
| `workers`       | `boolean`             | Omit for automatic selection, use `false` to opt out, or `true` to require workers                   |
| `extract`       | `{ format, outFile }` | Optional [message extraction](#extracting-messages) settings                                         |
