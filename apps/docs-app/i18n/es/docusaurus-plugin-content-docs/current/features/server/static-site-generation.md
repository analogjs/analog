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

Es posible que desees prerenderizar todas las rutas que son el resultado de un directorio de contenido renderizado. Por ejemplo, si tienes un blog y todos tus artículos están ubicados como archivos Markdown en el directorio `contents`. Para tales escenarios, puedes añadir un objeto a la configuración de `routes` para renderizar todo dentro de un directorio. Ten en cuenta que la estructura de tu directorio puede no reflejarse 1:1 en la ruta de tu aplicación. Por lo tanto, debes pasar una función `transform` que mapee las rutas de los archivos a las URLs. La cadena retornada debe ser la ruta URL en tu aplicación. Usar `transform` también te permite filtrar algunas rutas retornando `false`. Esto no las incluye en el proceso de prerenderización, como archivos marcados como `draft` en el frontmatter. El valor de `contentDir` de ese objeto puede ser un patrón glob o simplemente una ruta específica.

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
        ],
      },
    }),
  ],
}));
```

Las páginas estáticas pueden ser desplegadas desde el directorio `dist/analog/public`.

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
          host: 'https://analogjs.org/',
        },
      },
    }),
  ],
}));
```

Mientras las rutas estén proporcionadas, Analog genera un archivo `sitemap.xml` que contiene un mapeo de las propiedades `<loc>` y `<lastmod>` de las páginas.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset...>
    <!--Este archivo fue generado automáticamente por Analog.-->
    <url>
        <loc>https://analogjs.org/</loc>
        <lastmod>2023-07-01</lastmod>
    </url>
    <url>
        <loc>https://analogjs.org/blog</loc>
        <lastmod>2023-07-01</lastmod>
    </url>
</urlset...>
```

### Hooks de Post-renderización

Analog soporta hooks de post-renderización durante el proceso de prerenderización. El caso de uso para hooks de post-renderización puede ser incrustar CSS crítico, añadir/remover scripts en archivos HTML, etc.

El siguiente código de ejemplo muestra cómo usar `postRenderingHooks` en tu código:

```ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import { PrerenderRoute } from 'nitro/types';

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
import { PrerenderRoute } from 'nitro/types';

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
