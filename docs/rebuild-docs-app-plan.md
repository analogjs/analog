# Rebuilding docs-app with Analog

Design plan for replacing the current Docusaurus-based `apps/docs-app` with an
Analog-based equivalent at `apps/docs-analog`.

## Goals & non-goals

**Goal:** Full end-to-end replacement of Docusaurus with Analog. Dogfood
Analog for the entire public site (marketing + docs + all 7 locales).

**Non-goals:**

- No incremental URL handoff between Docusaurus and Analog
- No new translation tooling (translators keep contributing markdown files)
- No versioned-docs feature (Docusaurus config never used it)

## Rollout

- New project at `apps/docs-analog`, built on a dedicated feature branch
- Existing `apps/docs-app` keeps shipping unchanged until cutover
- Hard cutover when at parity; old app deleted in the cutover PR
- All 7 non-English locales (de, es, fr, ko, pt-br, tr, zh-hans) ship at
  cutover — no English-only intermediate release

## Routing & rendering

- Layout-route shell at `src/app/pages/docs.page.ts` (header, sidebar, content
  area, footer)
- Catchall child at `src/app/pages/docs/[...slug].page.ts` resolves the slug
  via `injectContent()`
- Same pattern under `src/app/pages/[locale]/docs/...`; `[locale]` flows into
  `withLocale({ loadLocale: () => injectActivatedRoute().snapshot.params['locale'] })`
- Nitro `prerender` enumerates all routes from `src/content/**/*.md`; output
  is pure SSG
- Homepage and marketing pages are normal Analog page components
- **URL contract preserved verbatim:**
  - `analogjs.org/docs/...` (English)
  - `analogjs.org/<locale>/docs/...` (other locales — Docusaurus convention)
- `/` always serves English; no `Accept-Language` redirect (would require a
  Worker on Zerops, defer indefinitely)

## Content

### Corpus layout

- 48 English docs → `apps/docs-analog/src/content/<existing-path>.md`
- 110 translated docs → `apps/docs-analog/src/content/<locale>/<existing-path>.md`
- Migration via mechanical `git mv` + path-rewrite script (one commit per
  locale to keep diffs reviewable)

### MDX handling

Tiered approach:

| Surface                                                                  | Handling                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Admonitions (`:::tip`, `:::info`, `:::note`, `:::warning`, `:::caution`) | Custom `marked` extension emits `<aside class="admonition admonition-<kind>">`                         |
| `<Tabs>` / `<TabItem>` (heavy use in `getting-started.md`)               | Fenced-code convention (e.g. ` ```tabs ` with YAML body) hydrated by an Angular `<doc-tabs>` component |
| `.mdx` page files (`contributors.mdx`, `sponsoring.mdx`)                 | Re-authored as Angular page components — they're really pages-with-prose, not docs                     |
| `contributing.md` importing root `CONTRIBUTING.md`                       | Build-time copy from repo root into `src/content/contributing.md` via a `prebuild` script              |

### Marked / Shiki config

```ts
analog({
  content: {
    highlighter: 'shiki',
    shikiOptions: {
      highlight: { theme: nightOwl },
      highlighter: {
        additionalLangs: ['toml', 'json', 'bash'],
      },
    },
    markedOptions: {
      extensions: [{ extensions: [AdmonitionExtension] }],
    },
  },
  // ...
});
```

## Navigation

- `sidebars.js` ported verbatim to typed TS at `src/app/sidebar.ts`:

```ts
type SidebarNode =
  | { type: 'doc'; id: string; label?: string }
  | { type: 'category'; label: string; items: SidebarNode[] };

export const sidebar: SidebarNode[] = [
  { type: 'doc', id: 'introduction' },
  { type: 'doc', id: 'getting-started' },
  { type: 'category', label: 'Core Concepts', items: [...] },
  // ...
];
```

- `<doc-sidebar>` Angular component traverses the tree, resolves each `id`
  against `injectContentFiles()` to get titles, applies the current-locale
  filter automatically (since `withLocale()` handles it), renders nav with
  `routerLinkActive`
- Prev/Next links at the bottom of each doc page computed by flattening the
  same tree and finding the current node's neighbors — one source of truth

## Design & UX

- **Visual redesign during the rebuild**, not a Docusaurus clone
- **Tailwind + CSS custom properties** for design tokens (dark mode via
  `:root[data-theme="dark"]` overrides)
- Right-rail TOC via runtime DOM scan + `MutationObserver` +
  `IntersectionObserver` scroll-spy (pattern: hashbrown's
  `www/analog/src/app/components/MarkdownPage.ts`)
- Heading anchors with hover-reveal `#`
- Code blocks: copy button, language label, optional title attribute
- Algolia DocSearch modal triggered by `Cmd+K`

## SEO & integrations

| Concern                      | Implementation                                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hreflang` alternates        | Per-route metadata helper called from each page's `routeMeta` — given the canonical EN path, emits `<link rel="alternate" hreflang="...">` for every locale where the file exists                    |
| Sitemap                      | Vite plugin walks `src/content/**/*.md`, emits `sitemap.xml` with `<xhtml:link>` alternates                                                                                                          |
| Broken-link check            | Vite post-build plugin walks prerendered HTML in `dist/`, validates all internal `href`s resolve to generated files, fails the build on any miss (parity with Docusaurus's `onBrokenLinks: 'throw'`) |
| `gtag` analytics             | Paste-in `<script>` tag in root index.html                                                                                                                                                           |
| Algolia DocSearch            | Keep existing index — URL contract preserved means the crawler keeps working without re-application                                                                                                  |
| `llms.txt` / `llms-full.txt` | Vite plugin `closeBundle` hook; reuses current path-to-URL logic from `apps/docs-app/docusaurus.config.js` almost verbatim                                                                           |

## Deployment

- **Zerops** (current host); pure SSG output works regardless of preset
- Build output: `dist/apps/docs-analog/public` (or whatever path Zerops's
  static-serve config expects — confirm at parity check)

## Implementation phases

Suggested ordering, each phase mergeable to the feature branch on its own:

1. **Scaffold** — `nx g @analogjs/platform:app docs-analog`; Tailwind setup;
   basic shell with header/footer/sidebar component skeletons
2. **Content infra** — Shiki config; admonition marked extension; locale
   routing; layout route + catchall child rendering markdown
3. **Sidebar + navigation** — typed sidebar.ts; `<doc-sidebar>`; prev/next;
   TOC right-rail
4. **English content port** — `git mv apps/docs-app/docs apps/docs-analog/src/content`
   plus link-rewrite script; verify all English routes render
5. **Locale content port** — `git mv` each `i18n/<locale>/docusaurus-plugin-content-docs/current`
   into `src/content/<locale>/`; verify locale routing
6. **MDX features** — `<doc-tabs>`; `.mdx` page components; CONTRIBUTING.md
   build-time copy
7. **SEO** — hreflang helper; sitemap plugin; per-page metadata
8. **Quality gates** — broken-link checker; build into CI; `llms.txt`
   generator
9. **Search** — Algolia DocSearch integration; Cmd+K modal
10. **Design pass** — visual polish, dark mode, mobile responsive
11. **Cutover PR** — delete `apps/docs-app`; rename project to `docs` if
    desired; update Zerops config; flip DNS

## Open items not covered in design

These were flagged but didn't warrant a design decision:

- **Translator workflow doc** — update `CONTRIBUTING.md` to direct
  contributors to `apps/docs-analog/src/content/<locale>/...`
- **Edit on GitHub link** — trivial per-page link computed from doc path
- **No versioned docs** — confirmed by current Docusaurus config
- **Hashbrown's translate-docs tool** — interesting prior art if we ever want
  to bootstrap new-locale support; out of scope for the rebuild

## Reference

- Hashbrown's Analog docs: <https://github.com/liveloveapp/hashbrown> (see
  `www/analog`). Key patterns we're borrowing: typed sidebar models,
  layout-route shell, `MarkdownPage` with TOC scroll-spy, Shiki config,
  custom `marked` extensions slot.
