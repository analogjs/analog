# Developers

Everything you need to build with Analog, the fullstack Angular
meta-framework — for people and for agents. No API keys or accounts are
required for anything on this page.

## Quickstart

Scaffold a new project with the official CLI, published on npm as
`create-analog` (https://www.npmjs.com/package/create-analog):

    npm create analog@latest

Or try it without installing anything in the StackBlitz sandbox:
https://analogjs.org/new. The getting started guide
(https://analogjs.org/docs/getting-started) covers the rest.

## Machine-readable resources

The whole site is agent-friendly: unknown paths return real HTTP 404s
(structured JSON errors under `/api/`), and every docs page is served as raw
Markdown at its URL plus `.md` — or by requesting the page with
`Accept: text/markdown`.

- https://analogjs.org/openapi.json — OpenAPI 3.1 description of every
  machine-readable endpoint on this site.
- https://analogjs.org/api/v1/docs.json — JSON index of every docs page;
  each entry links its HTML, Markdown, and JSON forms.
- https://analogjs.org/llms.txt — Markdown docs index for LLMs
  (llmstxt.org), with when-to-use guidance for agents.
- https://analogjs.org/llms-full.txt — the whole documentation corpus in one
  file.
- https://analogjs.org/sitemap.xml — sitemap of every page, including locale
  alternates.

## Source, packages, and support

Analog is MIT-licensed and developed at https://github.com/analogjs/analog.
The framework ships as scoped npm packages — `@analogjs/platform`,
`@analogjs/router`, `@analogjs/content`, `@analogjs/vite-plugin-angular`,
and more. See https://analogjs.org/docs/contributing to get involved, or ask
questions on Discord (https://chat.analogjs.org) and
https://analogjs.org/docs/support.
