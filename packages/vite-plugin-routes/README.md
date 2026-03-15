# `@analogjs/vite-plugin-routes`

Generates typed Analog route declarations for file-based routing.

Most apps should enable typed routes through `@analogjs/platform`:

```ts
analog({
  experimental: {
    typedRouter: true,
  },
});
```

Use this package directly when you need explicit Vite plugin composition or more direct control over route generation.

It also exports `jsonLdManifest()` for generating route-to-JSON-LD manifests used by SSR and prerender flows.
