---
title: Routing
description: File-based routing with layouts, dynamic segments, and catchalls.
---

Routes are derived from files under `src/app/pages/`. The filename maps to
the URL: `pages/about.page.ts` becomes `/about`.

## Dynamic segments

Brackets denote dynamic segments:

```
pages/posts/[id].page.ts   →  /posts/:id
pages/[locale]/docs.page.ts →  /:locale/docs
```

## Catchalls

`[...slug]` captures any number of remaining segments:

```
pages/docs/[...slug].page.ts  →  /docs/* (any depth)
```

:::note
Catchall routes are great for content-driven sections. Combine with
`injectContent('slug')` to resolve the captured path against your
content directory.
:::
