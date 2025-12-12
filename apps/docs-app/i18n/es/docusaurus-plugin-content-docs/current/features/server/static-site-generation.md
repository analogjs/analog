# Construyendo Sitios Estáticos

Analog soporta la Generación de Sitios Estáticos al construir para despliegue. Esto incluye prerenderizar rutas proporcionadas a archivos HTML estáticos junto con la aplicación del lado del cliente.

## Generación de Sitios Estáticos

### Desde una Lista de Rutas

Para prerenderizar páginas, usa la propiedad `prerender` para configurar las rutas que serán renderizadas en tiempo de compilación. Las rutas a prerenderizar también pueden proporcionarse de forma asíncrona.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: async () => [
          '/',
          '/about',
          '/blog',
          '/blog/posts/2023-02-01-my-first-post',
        ],
      },
    }),
  ],
}));
```

### Desde el Directorio de Contenido

Es posible que desees prerenderizar todas las rutas que son el resultado de un directorio de contenido renderizado. Por ejemplo, si tienes un blog y todos tus artículos están ubicados como archivos Markdown en el directorio `contents`.

Para tales escenarios, puedes añadir un objeto a la configuración de `routes` para renderizar todo dentro de un directorio.

Ten en cuenta que la estructura de tu directorio puede no reflejarse 1:1 en la ruta de tu aplicación. Por lo tanto, debes pasar una función `transform` que mapee las rutas de los archivos a las URLs. La cadena retornada debe ser la ruta URL en tu aplicación.

Usar `transform` también te permite filtrar algunas rutas retornando `false`. Esto no las incluye en el proceso de prerenderización, como archivos marcados como `draft` en el frontmatter.

El valor de `contentDir` de ese objeto puede ser un patrón glob o simplemente una ruta específica.

```ts
import { defineConfig } from 'vite';
import analog, { type PrerenderContentFile } from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: async () => [
          '/',
          '/blog',
          {
            contentDir: 'src/content/blog',
            transform: (file: PrerenderContentFile) => {
              // no incluir archivos marcados como draft en el frontmatter
              if (file.attributes.draft) {
                return false;
              }
              // usar el slug del frontmatter si está definido, de lo contrario usar el nombre base del archivo
              const slug = file.attributes.slug || file.name;
              return `/blog/${slug}`;
            },
          },
        ],
      },
    }),
  ],
}));
```

### Solo páginas estáticas

Para prerenderizar únicamente las páginas estáticas, usa la bandera `static: true`.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      static: true,
      prerender: {
        routes: async () => [
          '/',
          '/about',
          '/blog',
          '/blog/posts/2023-02-01-my-first-post',
          // Prerenderizar pagina 404.html para SPAs
          '/404.html',
        ],
      },
      nitro: {
        routeRules: {
          '/404.html': { ssr: false },
        },
      },
    }),
  ],
}));
```

Las páginas estáticas pueden ser desplegadas desde el directorio `dist/analog/public`.

## Prerenderizando datos del lado del servidor

Al utilizar [la recuperación de datos del lado del servidor](/docs/features/data-fetching/server-side-data-fetching), los datos se cachean y se reutilizan utilizando el estado de transferencia _solo_ en la primera solicitud. Para prerenderizar los datos del lado del servidor recuperados junto con la ruta, establezca la bandera `staticData` en `true` en el objeto de configuración para la ruta prerenderizada.

Por ejemplo, una ruta definida como `src/app/pages/shipping.page.ts` con un archivo asociado `src/app/pages/shipping.server.ts` tiene la ruta y los datos del lado del servidor prerenderizados para ser completamente estáticos.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      static: true,
      prerender: {
        routes: async () => [
          '/',
          {
            route: '/shipping',
            staticData: true,
          },
        ],
      },
    }),
  ],
}));
```

### Generación de Sitemap

Analog también soporta la generación automática de sitemaps. Analog genera un sitemap en el directorio `dist/analog/public` al ejecutar una compilación si se proporciona una configuración de sitemap.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: async () => ['/', '/blog'],
        sitemap: {
          host: 'https://analogjs.org',
        },
      },
    }),
  ],
}));
```

Para personalizar la definición del sitemap, utilice la función de callback `sitemap` para personalizar los campos `lastmod`, `changefreq` y `priority`.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import fs from 'node:fs';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        sitemap: {
          host: 'https://analogjs.org',
        },
        routes: async () => [
          '/',
          '/blog',
          {
            route: '/blog/2022-12-27-my-first-post',
            sitemap: {
              lastmod: '2022-12-27',
            },
          },
          {
            contentDir: '/src/content/archived',
            transform: (file: PrerenderContentFile) => {
              return `/archived/${file.attributes.slug || file.name}`;
            },
            sitemap: (file: PrerenderContentFile) => {
              return {
                lastmod: 'read last modified date for content file',
                changefreq: 'never',
              };
            },
          },
        ],
      },
    }),
  ],
}));
```

Siempre que se proporcionen rutas de prerrenderizado, Analog generará un archivo `sitemap.xml` que contiene un mapeo de las propiedades `<loc>`, `<lastmod>`, `<changefreq>` y `<priority>` de las páginas.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset...>
    <!--This file was automatically generated by Analog.-->
    <url>
        <loc>https://analogjs.org/</loc>
        <lastmod>2023-07-01</lastmod>
    </url>
    <url>
        <loc>https://analogjs.org/blog/2022-12-27-my-first-post</loc>
        <lastmod>2022-12-27</lastmod>
    </url>
    <url>
        <loc>https://analogjs.org/blog/archived/hello-world</loc>
        <lastmod>2022-12-01</lastmod>
        <changefreq>never</changefreq>
    </url>
</urlset...>
```

### Hooks de Post-renderización

Analog soporta hooks de post-renderización durante el proceso de prerenderización. El caso de uso para hooks de post-renderización puede ser incrustar CSS crítico, añadir/remover scripts en archivos HTML, etc.

El siguiente código de ejemplo muestra cómo usar `postRenderingHooks` en tu código:

```ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import { PrerenderRoute } from 'nitropack';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    publicDir: 'src/public',
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        static: true,
        prerender: {
          routes: async () => [],
          postRenderingHooks: [
            async (route: PrerenderRoute) => console.log(route),
          ],
        },
      }),
    ],
  };
});
```

El `PrerenderRoute` te proporciona información sobre `route`, `contents`, `data`, y `fileName`, lo cual puede ser útil para hacer cambios en tu contenido durante la fase de prerenderización.

A continuación, se muestra un pequeño ejemplo donde podemos añadir un script para incluir Google Analytics durante el proceso de prerenderización usando `postRenderingHooks`:

```ts
/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { PrerenderRoute } from 'nitropack';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    publicDir: 'src/public',
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        static: true,
        prerender: {
          routes: async () => ['/', '/aboutus'],
          postRenderingHooks: [
            async (route: PrerenderRoute) => {
              const gTag = `<script>
              (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
                (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
                m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
                })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

                ga('create', 'UA-xxxxxx-1', 'auto');
                ga('send', 'pageview');
              </script>`;
              if (route.route === '/aboutus') {
                route.contents = route.contents?.concat(gTag);
              }
            },
          ],
        },
      }),
    ],
  };
});
```
