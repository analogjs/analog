# @analogjs/astro-angular

[Astro](https://astro.build) is a modern web framework designed for building fast, content-focused websites, compatible with all major frontend frameworks. Though primarily a static site generation (SSG) tool, it can also integrate dynamic components called "islands", which support partial hydration.

This package allows rendering [Angular](https://angular.dev) components as islands in Astro.

## Setup

### Using the Astro CLI

Use the `astro add` command to install the integration

```sh
# Using NPM
npx astro add @analogjs/astro-angular
# Using Yarn
yarn astro add @analogjs/astro-angular
# Using PNPM
pnpm astro add @analogjs/astro-angular
```

This command:

- Installs the `@analogjs/astro-angular` package.
- Adds the `@analogjs/astro-angular` integration to the `astro.config.mjs` file.
- Installs the necessary dependencies to render Angular components on the server and client, and common Angular dependencies, such as `@angular/common`.

### Setting up the TypeScript config

The integration needs a `tsconfig.app.json` at the root of the project for compilation.

Create a `tsconfig.app.json` in the root of the project.

```json
{
  "extends": "./tsconfig.json",
  "compileOnSave": false,
  "compilerOptions": {
    "baseUrl": "./",
    "outDir": "./dist/out-tsc",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "sourceMap": true,
    "declaration": false,
    "downlevelIteration": true,
    "experimentalDecorators": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "noEmit": false,
    "target": "es2020",
    "module": "es2020",
    "lib": ["es2020", "dom"],
    "skipLibCheck": true
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true,
    "allowJs": false
  },
  "files": [],
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Go to [Defining A Component](#defining-a-component) to set up an Angular component
to use in an Astro component.

## Manual Installation

The integration can also be installed manually

### Install the Astro Integration

```sh
yarn add @analogjs/astro-angular
```

### Install the necessary Angular dependencies

```sh
yarn add @angular-devkit/build-angular @angular/{animations,common,compiler-cli,compiler,core,language-service,forms,platform-browser,platform-browser-dynamic,platform-server} rxjs zone.js tslib
```

### Adding the integration

Add the integration to the `astro.config.mjs`

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular()],
});
```

Go to [Defining A Component](#defining-a-component)

## Configuration

### Configure Vite Angular Plugin

Provide an option object to configure the `@analogjs/vite-plugin-angular` powering this plugin.

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [
    angular({
      vite: {
        inlineStylesExtension: 'scss|sass|less',
      },
    }),
  ],
});
```

### Transforming Packages for SSR Compatibility

To ensure Angular libraries are transformed during Astro's SSR process, add them to the `ssr.noExternal` array in the Vite config.

```js
import { defineConfig } from 'astro/config';

import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular()],
  vite: {
    ssr: {
      // transform these packages during SSR. Globs supported
      noExternal: ['@rx-angular/**'],
    },
  },
});
```

## Defining A Component

The Astro Angular integration **only** supports rendering standalone components:

```ts
import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-hello',
  standalone: true,
  imports: [NgIf],
  template: `
    <p>Hello from Angular!!</p>

    <p *ngIf="show">{{ helpText }}</p>

    <button (click)="toggle()">Toggle</button>
  `,
})
export class HelloComponent {
  @Input() helpText = 'help';

  show = false;

  toggle() {
    this.show = !this.show;
  }
}
```

Add the Angular component to the Astro component template. This only renders the HTML from the Angular component.

```tsx
---
import { HelloComponent } from '../components/hello.component';

const helpText = "Helping binding";
---

<HelloComponent />
<HelloComponent helpText="Helping" />
<HelloComponent helpText={helpText} />
```

To hydrate the component on the client, use one of the Astro [client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives):

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible />
```

Find more information about [Client Directives](https://docs.astro.build/en/reference/directives-reference/#client-directives) in the Astro documentation.

### Listening to Component Outputs

Outputs can be emitted by the Angular component are forwarded as HTML events to the Astro island.
To enable this feature, add a client directive and a unique `[data-analog-id]` property to each Angular component:

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible data-analog-id="hello-component-1" />
```

Then, listen to the event in the Astro component using the `addOutputListener` function:

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible data-analog-id="hello-component-1" />

<script>
  import { addOutputListener } from '@analogjs/astro-angular/utils';

  addOutputListener('hello-component-1', 'outputName', (event) => {
    console.log(event.detail);
  });
</script>
```

## Adding Component Providers

Additional providers can be added to a component for static rendering and client hydration.

These are `renderProviders` and `clientProviders` respectively. These providers are defined as static arrays on the Component class, and are registered when the component is rendered, and hydrated on the client.

```ts
import { Component, OnInit, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { provideHttpClient, HttpClient } from '@angular/common/http';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-todos',
  standalone: true,
  imports: [NgFor],
  template: `
    <h2>Todos</h2>

    <ul>
      <li *ngFor="let todo of todos">
        {{ todo.title }}
      </li>
    </ul>
  `,
})
export class TodosComponent implements OnInit {
  static clientProviders = [provideHttpClient()];
  static renderProviders = [];

  http = inject(HttpClient);
  todos: Todo[] = [];

  ngOnInit() {
    this.http
      .get<Todo[]>('https://jsonplaceholder.typicode.com/todos')
      .subscribe((todos) => (this.todos = todos));
  }
}
```

## Using Components in MDX pages

To use components with MDX pages, you must install and configure MDX support by following the Astro integration of [@astrojs/mdx](https://docs.astro.build/en/guides/integrations-guide/mdx/). Your `astro.config.mjs` should now include the `@astrojs/mdx` integration.

> Note: Shiki is the default syntax highlighter for the MDX plugin and is currently unsupported. `astro-angular` will override this with `prism` but you should specify it in the config to prevent warnings or issues.

```js
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [mdx({ syntaxHighlight: 'prism' }), angular()],
});
```

Create an `.mdx` file inside the `src/pages` directory and add the Angular component import below the frontmatter.

```md
---
layout: '../../layouts/BlogPost.astro'
title: 'Using Angular in MDX'
description: 'Lorem ipsum dolor sit amet'
pubDate: 'Sep 22 2022'
---

import { HelloComponent } from "../../components/hello.component.ts";

<HelloComponent />
<HelloComponent helpText="Helping" />
```

To hydrate the component on the client, use one of the Astro [client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives):

```md
---
layout: '../../layouts/BlogPost.astro'
title: 'Using Angular in MDX'
description: 'Lorem ipsum dolor sit amet'
pubDate: 'Sep 22 2022'
---

import { HelloComponent } from "../../components/hello.component.ts";

<HelloComponent client:load />
<HelloComponent client:visible helpText="Helping" />
```

> Important: In `.mdx` files the component import must end with the `.ts` suffix. Otherwise the dynamic import of the component will fail and the component won't be hydrated.

## Current Limitations

- Only standalone Angular components in version v14.2+ are supported
