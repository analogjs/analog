# AnalogJS — conventions for AI coding assistants

This file ships with `@analogjs/platform` and documents how to work in an [AnalogJS](https://analogjs.org) app (an Angular meta-framework, powered by Vite). A generated app's root `AGENTS.md` points here so the guidance stays in sync with the installed version.

## Commands

- `npm start` / `npm run dev` — start the dev server (Vite)
- `npm run build` — production build
- `npm test` — run unit tests (Vitest)
- `npm run preview` — run the built server locally

## Project structure

- `src/app/pages/` — file-based routes (see Routing below)
- `src/app/` — components and app config (`app.config.ts`, `app.config.server.ts`)
- `src/server/routes/` — server and API routes (Nitro + h3)
- `src/main.ts` / `src/main.server.ts` — client and server bootstrap
- `vite.config.ts` — Vite + Analog plugin and Vitest config

## Routing

Routes are file-based. A file in `src/app/pages/` ending in `.page.ts` becomes a route, and it must `export default` a standalone Angular component.

- `index.page.ts` → `/`
- `about.page.ts` → `/about`
- `products/index.page.ts` → `/products`
- `products/[productId].page.ts` → `/products/:productId` (dynamic segment)
- `(auth).page.ts` + `(auth)/*.page.ts` → pathless layout: `(auth).page.ts` renders a `<router-outlet />` and wraps its child routes (e.g. `(auth)/login.page.ts` → `/login`, `(auth)/signup.page.ts` → `/signup`) without adding a path segment
- `[...not-found].page.ts` → catch-all / 404

Read route params with `inject(ActivatedRoute)` from `@angular/router`.

Define per-route metadata (title, meta tags, guards, resolvers) by exporting a `RouteMeta`:

```ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  title: 'Products',
};
```

## Server & API routes

Server routes live in `src/server/routes/` and use [h3](https://h3.dev). API routes are conventionally under `src/server/routes/api/`.

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

Filenames encode the HTTP method and params: `hello.get.ts`, `users.post.ts`, `users/[id].get.ts`.

## Data fetching

- **Page load functions:** add a sibling `.server.ts` `load` function and read its result in the page with `injectLoad` from `@analogjs/router`.
- **Server functions:** define functions in `.server.ts` files and call them from the client with `injectServerFn`.

## Content routes

Markdown content is supported via `@analogjs/content`: `injectContent` / `injectContentFiles` to load content, and `MarkdownComponent` (`analog-markdown`) to render it. Content files live in `src/content/`.

## Conventions

- Use modern Angular: standalone components, `inject()`, signals, and the built-in control flow (`@if`, `@for`, `@switch`).
- Page components are **default-exported**.
- Tests are colocated as `*.spec.ts` and run under Vitest (jsdom environment).
- Prefer existing Angular and Analog APIs over hand-rolled equivalents.

## More

Full documentation: https://analogjs.org/docs
LLM-friendly docs index: https://analogjs.org/llms.txt
