# Internationalization (i18n)

Analog supports runtime internationalization using Angular's built-in `$localize` system. This allows you to serve translated content with a single build, detecting the user's locale at runtime on both the server and client.

## Setup

### 1. Install `@angular/localize`

Add the `@angular/localize` package to your project:

```bash
npm install @angular/localize
```

### 2. Initialize `$localize`

Import the `$localize` polyfill in your application's entry point (`src/main.ts` or `src/main.server.ts`):

```ts
import '@angular/localize/init';
```

### 3. Create Translation Files

Create JSON translation files for each supported locale. For example:

```
src/
  i18n/
    en.json
    fr.json
    de.json
```

Each file maps message IDs to translated strings:

```json
{
  "greeting": "Bonjour",
  "farewell": "Au revoir"
}
```

:::tip
Message IDs are generated automatically by Angular's `$localize` runtime based on the template content, meaning, and description.
:::

### 4. Provide i18n Configuration

Add `provideI18n()` to your application config:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideFileRouter, provideI18n } from '@analogjs/router';

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
  ],
};
```

The `provideI18n()` function accepts an `I18nConfig` object with the following properties:

| Property        | Type                                                                            | Description                                     |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| `defaultLocale` | `string`                                                                        | The default locale when none is detected        |
| `locales`       | `string[]`                                                                      | List of supported locale identifiers            |
| `loader`        | `(locale: string) => Promise<Record<string, string>> \| Record<string, string>` | Function that returns translations for a locale |

## Using Translations in Templates

Use Angular's `i18n` attribute to mark text for translation:

```html
<h1 i18n="@@greeting">Hello</h1>
<p i18n="@@farewell">Goodbye</p>
```

Or use `$localize` directly in component code:

```ts
import { Component } from '@angular/core';

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

1. **URL path prefix** — A locale prefix in the URL path (e.g., `/fr/about` resolves to `fr`)
2. **`Accept-Language` header** — The browser's preferred language from the request headers

### Client-Only Mode

When SSR is disabled (`ssr: false`), `provideI18n()` detects the locale from `window.location.pathname` by matching the first URL segment against the configured `locales` list. If no match is found, `defaultLocale` is used.

### Accessing the Current Locale

The detected locale is available through the `LOCALE` injection token. Inject it anywhere in your application:

```ts
import { Component } from '@angular/core';
import { injectLocale } from '@analogjs/router/tokens';

@Component({
  selector: 'app-language-switcher',
  template: `<span>Current locale: {{ locale }}</span>`,
})
export class LanguageSwitcherComponent {
  locale = injectLocale();
}
```

## URL-Based Locale Routing

To serve different locales at distinct URL paths (e.g., `/en/about`, `/fr/about`), use a locale prefix in your routes. Analog's locale detection will extract the locale from the first URL path segment if it matches a valid BCP 47 language tag (e.g., `en`, `fr`, `en-US`, `zh-CN`).

A common pattern is to redirect the root URL to the user's preferred locale:

```ts
// src/app/pages/index.page.ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LOCALE } from '@analogjs/router/tokens';

@Component({
  standalone: true,
  template: '',
})
export default class IndexPage {
  constructor() {
    const router = inject(Router);
    const locale = inject(LOCALE, { optional: true }) ?? 'en';
    router.navigate([locale]);
  }
}
```

## Switching Locale at Runtime

Angular's `$localize` resolves translations at template evaluation time, so switching locale requires a full page navigation to re-evaluate all templates with the correct translations.

Use `injectSwitchLocale()` in your components. It reads the configured locales from `provideI18n()` automatically:

```ts
import { Component } from '@angular/core';
import { injectLocale } from '@analogjs/router/tokens';
import { injectSwitchLocale } from '@analogjs/router';

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
import { loadTranslationsRuntime } from '@analogjs/router';

const translations = await fetch('/i18n/fr.json').then((r) => r.json());
loadTranslationsRuntime(translations);
```

:::info
`loadTranslationsRuntime()` updates the translation map in memory, but components that have already rendered will not re-render. Use `switchLocale()` or `injectSwitchLocale()` for a full locale switch.
:::

## Extracting Messages

Analog can extract i18n message IDs from your compiled build output. Enable extraction in the platform plugin options:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

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
import {
  provideContent,
  withMarkdownRenderer,
  withLocale,
} from '@analogjs/content';
import { injectLocale } from '@analogjs/router/tokens';

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
// Blog list — returns only posts for the active locale
const posts = injectContentFiles<PostAttributes>((file) =>
  file.filename.includes('/blog/'),
);

// Blog detail — resolves /content/fr/blog/my-post.md when locale is 'fr'
const post$ = injectContent<PostAttributes>({
  param: 'slug',
  subdirectory: 'blog',
});
```

No locale-specific code is needed in components — the content APIs handle it internally.

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

During development, the Analog dev server provides full i18n support:

- **`<html lang>` injection** — The `lang` attribute on the `<html>` tag is set automatically based on the detected locale for each request.
- **Translation file HMR** — Editing translation files in `i18n/` directories (`.json`, `.xlf`, `.xmb`, `.arb`) triggers an automatic page reload so changes are reflected immediately.
- **Locale-prefixed routes** — URLs like `http://localhost:5173/fr/about` work out of the box. The SSR middleware detects the locale and loads the correct translations.

## Prerendering

When `i18n` is configured in the platform options, prerendering automatically generates locale-prefixed variants for each route.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

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

1. **Expand routes** — Each route is prerendered for every locale: `/en/about`, `/fr/about`, `/de/about`, etc. The unprefixed routes are also kept for the default locale.
2. **Set `<html lang>`** — Each prerendered page receives the correct `lang` attribute (e.g., `<html lang="fr">`).
3. **Generate hreflang links in the sitemap** — The sitemap includes `<xhtml:link rel="alternate" hreflang="...">` entries for each locale variant, plus an `x-default` entry pointing to the default locale.

## Platform Configuration

You can declare your supported locales in the platform plugin options in `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      i18n: {
        defaultLocale: 'en',
        locales: ['en', 'fr', 'de'],
      },
    }),
  ],
}));
```

This makes the i18n configuration available to the build pipeline for locale detection during SSR and message extraction.
