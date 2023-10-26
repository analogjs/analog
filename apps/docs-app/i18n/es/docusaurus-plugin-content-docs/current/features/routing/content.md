import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Rutado de contenido

Analog también soporta el uso de contenido markdown como rutas, y renderizar contenido markdown en componentes.

### Configuración

En el fichero `src/app/app.config.ts`, añade la función `provideContent()`, junto con la característica `withMarkdownRenderer()` al array de `providers` cuando se inicia la aplicación.

```ts
import { ApplicationConfig } from '@angular/core';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... otros providers
    provideContent(withMarkdownRenderer()),
  ],
};
```

## Definiendo Rutas de Contenido

Las rutas de contenido incluyen soporte para frontmatter, metatags, y syntax highlighting con PrismJS.

El ejemplo de ruta abajo en `src/app/pages/about.md` define una ruta `/about`.

```md
---
title: About
meta:
  - name: description
    content: About Page Description
  - property: og:title
    content: About
---

## Acerca de Analog

Analog es un meta-framework de Angular.

[Regresar al inicio](./)
```

### Utilizando el plugin de resaltar cambios en el código

Analog soporta resaltar los cambios en el código con PrismJS. Añade el lenguaje `diff`
y las importaciones del plugin `diff-highlight` a `app.config.ts`:

```ts
import 'prismjs/components/prism-diff';
import 'prismjs/plugins/diff-highlight/prism-diff-highlight';
```

Usa la etiqueta de lenguaje `diff` para resaltarlos
o `diff-<language>` para resaltar los cambios de diff en un lenguaje específico.

````md
```diff
- This is a sentence.
+ This is a longer sentence.
```

```diff-typescript
- const foo = 'bar';
+ const foo = 'baz';
```
````

Para resaltar los cambios de fondo de línea en lugar de sólo el texto, añade esta importación a tu hoja de estilos global:

```css
@import 'prismjs/plugins/diff-highlight/prism-diff-highlight.css';
```

## Definiendo ficheros de contenido

Para mayor flexibilidad, los ficheros de contenido markdown pueden ser proporcionados en el directorio `src/content`. Aquí puedes listar ficheros markdown como posts de blog.

```md
---
title: My First Post
slug: 2022-12-27-my-first-post
description: My First Post Description
coverImage: https://images.unsplash.com/photo-1493612276216-ee3925520721?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=464&q=80
---

¡Hola Mundo!
```

## Usando la lista de ficheros de contenido

Para obtener una lista usando la lista de ficheros de contenido en el directorio `src/content`, usa la función `injectContentFiles<Attributes>(filterFn?: InjectContentFilesFilterFunction<Attributes>)` del paquete `@analogjs/content` en tu componente. Para reducir los ficheros, puedes usar la función de predicado `filterFn` como argumento. Puedes usar el tipo `InjectContentFilesFilterFunction<T>` para configurar tu predicado.

```ts
import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { injectContentFiles } from '@analogjs/content';
import { NgFor } from '@angular/common';

export interface PostAttributes {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
}

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgFor],
  template: `
    <ul>
      <li *ngFor="let post of posts">
        <a [routerLink]="['/blog', 'posts', post.slug]">{{
          post.attributes.title
        }}</a>
      </li>
    </ul>
  `,
})
export default class BlogComponent {
  readonly posts = injectContentFiles<PostAttributes>((contentFile) =>
    contentFile.filename.includes('/src/content/blog/')
  );
}
```

## Usando el componente Markdown

Analog provee un `MarkdownComponent` y una función `injectContent()` para renderizar contenido markdown con frontmatter.

La función `injectContent()` usa el parámetro de ruta `slug` por defecto para obtener el fichero de contenido del directorio `src/content`.

```ts
// /src/app/pages/blog/posts.[slug].page.ts
import { injectContent, MarkdownComponent } from '@analogjs/content';
import { AsyncPipe, NgIf } from '@angular/common';
import { Component } from '@angular/core';

export interface PostAttributes {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
}

@Component({
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe, NgIf],
  template: `
    <ng-container *ngIf="post$ | async as post">
      <h1>{{ post.attributes.title }}</h1>
      <analog-markdown [content]="post.content"></analog-markdown>
    </ng-container>
  `,
})
export default class BlogPostComponent {
  readonly post$ = injectContent<PostAttributes>();
}
```

## Soporte para Subdirectorios de Contenido

Analog también soporta subdirectorios dentro de tu subdirectorio de contenido.

La función `injectContent()` también puede ser usada con un objeto que contenga el parámetro de ruta y el nombre del subdirectorio.

Esto puede ser útil si, por ejemplo, tienes posts de blog, así como un portafolio de ficheros markdown de proyectos para ser usados en el sitio.

```treeview
src/
└── app/
│   └── pages/
│       └── project.[slug].page.ts
└── content/
    ├── posts/
    │   ├── my-first-post.md
    │   └── my-second-post.md
    └── projects/
        ├── my-first-project.md
        └── my-second-project.md
```

```ts
// /src/app/pages/project.[slug].page.ts
import { injectContent, MarkdownComponent } from '@analogjs/content';
import { AsyncPipe, NgIf } from '@angular/common';
import { Component } from '@angular/core';

export interface ProjectAttributes {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
}

@Component({
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe, NgIf],
  template: `
    <ng-container *ngIf="project$ | async as project">
      <h1>{{ project.attributes.title }}</h1>
      <analog-markdown [content]="project.content"></analog-markdown>
    </ng-container>
  `,
})
export default class ProjectComponent {
  readonly project$ = injectContent<ProjectAttributes>({
    param: 'slug',
    subdirectory: 'projects',
  });
}
```

## Caarga de Contenido Personalizado

Por defecto, Analog usa los parámetros de ruta para construir el nombre del fichero para recuperar un fichero de contenido del directorio `src/content`. Analog también soporta el uso de un nombre de fichero personalizado para recuperar contenido deel directorio `src/content`. Esto puede ser útil si, por ejemplo, tienes un fichero markdown personalizado que quieres cargar en una página.

La función `injectContent()` puede ser usada pasando un objeto que contenga la propiedad `customFilename`.

```ts
readonly post$ = injectContent<ProjectAttributes>({
  customFilename: 'path/to/custom/file',
});
```
