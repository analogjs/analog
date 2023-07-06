# API Routes

Analog supports defining API routes that can be used to serve data to the application.

## Defining an API Route

API routes are defined in the `src/server/routes` folder. API routes are also filesystem based,
and are exposed under the default `/api` prefix in development.

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

## Defining XML Content

To create an RSS feed for your site, set the `content-type` to be `text/xml` and Analog serves up the correct content type for the route.

```ts
//server/routes/rss.xml.ts

import { defineEventHandler } from 'h3';
export default defineEventHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  event.node.res.setHeader('content-type', 'text/xml');
  event.node.res.end(feedString);
});
```

**Note:** For SSG content, set Analog to prerender an API route to make it available as prerendered content:

```ts
// vite.config.ts
...
prerender: {
  routes: async () => {
    return [
      ...
      '/api/rss.xml',
      ...
      .
    ];
  },
  sitemap: {
    host: 'https://analog-blog.netlify.app',
  },
},
```

The XML is available as a static XML document at `/dist/analog/public/api/rss.xml`

## Custom API prefix

The prefix under which API routes are exposed can be configured with the
`apiPrefix` parameter passed to the `analog` vite plugin.

```ts
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      analog({
        apiPrefix: 'services',
      }),
    ],
  };
});
```

With this configuration, Analog exposes the API routes under the `/services` prefix.

A route defined in `src/server/routes/v1/hello.ts` can now be accessed at `/services/v1/hello`.

## More Info

API routes are powered by [Nitro](https://nitro.unjs.io). See the Nitro docs for more examples around building API routes.
