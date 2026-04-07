# @analogjs/astro-angular

[Astro](https://astro.build) is a modern web framework designed for building fast, content-focused websites, compatible with all major frontend frameworks. Though primarily a static site generation (SSG) tool, it can also integrate dynamic components called "islands", which support partial hydration.

This package allows rendering [Angular](https://angular.dev) components as islands in Astro.

## Setup

### Using the Astro CLI

Use the `astro add` command to install the integration

Using npm:

```sh
npx astro add @analogjs/astro-angular
```

Using pnpm:

```sh
pnpm astro add @analogjs/astro-angular
```

Using yarn:

```sh
yarn astro add @analogjs/astro-angular
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
npm install @angular/build @angular/{animations,common,compiler-cli,compiler,core,language-service,forms,platform-browser,platform-server} rxjs tslib --save
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

### Filtering File Transforms

For better compatibility when integrating with other plugins such as [Starlight](https://starlight.astro.build), put the Angular components in a specific folder and use the `transformFilter` callback function to only transform those files.

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [
    angular({
      vite: {
        transformFilter: (_code, id) => {
          return id.includes('src/components'); // <- only transform Angular TypeScript files
        },
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

### Strict Style Placement

Angular components can use style scoped to each component instance. By default, these style tags will be inserted adjacent to the component's HTML by `@analogjs/astro-angular`. While this will typically work for modern browsers, it is technically invalid HTML.

To force these component styles to the document head, enable the `strictStylePlacement` option in the integration config.

**Warning:** enabling this option will disable Astro's [streaming](https://docs.astro.build/en/recipes/streaming-improve-page-performance/) mode under SSR.

```js
import { defineConfig } from 'astro/config';

import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular({ strictStylePlacement: true })],
});
```

### Angular Client Hydration (Experimental)

By default, `@analogjs/astro-angular` performs hydration by bootstrapping the component on the client, replacing the DOM that was rendered on the server.

To opt-in to Angular's client hydration, enable the `experimental.useAngularHydration` option in the integration config. This will switch the hydration strategy to use [provideClientHydration](https://angular.dev/api/platform-browser/provideClientHydration).

```js
import { defineConfig } from 'astro/config';

import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular({ experimental: { useAngularHydration: true } })],
});
```

#### Skip Hydration

Use the `ngSkipHydration` attribute on any components which do not work properly with hydration enabled. Read more [here](https://angular.dev/guide/hydration#how-to-skip-hydration-for-particular-components).

## Defining A Component

The Astro Angular integration **only** supports rendering standalone components:

```ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-hello',
  template: `
    <p>Hello from Angular!!</p>

    @if (show()) {
      <p>{{ helpText() }}</p>
    }

    <button (click)="toggle()">Toggle</button>
  `,
})
export class HelloComponent {
  helpText = input('help');

  show = signal(false);

  toggle() {
    this.show.update((show) => !show);
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
import { provideHttpClient, HttpClient } from '@angular/common/http';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-todos',
  template: `
    <h2>Todos</h2>

    <ul>
      @for (todo of todos(); track todo.id) {
        <li>
          {{ todo.title }}
        </li>
      }
    </ul>
  `,
})
export class TodosComponent implements OnInit {
  static clientProviders = [provideHttpClient()];
  static renderProviders = [TodosComponent.clientProviders];

  http = inject(HttpClient);
  todos = signal<Todo[]>([]);

  ngOnInit() {
    this.http
      .get<Todo[]>('https://jsonplaceholder.typicode.com/todos')
      .subscribe((todos) => this.todos.set(todos));
  }
}
```

### Client Hydration Features (Experimental)

First, make sure the experimental Angular client hydration option is enabled in the integration config. Read more [here](#angular-client-hydration-experimental).

To add Angular hydration features, add a static property to the component class named `hydrationFeatures`. This should be a function that returns an array of hydration features to enable.

The example below adds the [event replay](https://angular.dev/guide/hydration#how-event-replay-works) feature to the component.

```ts
import { Component, input, signal } from '@angular/core';
import { withEventReplay } from '@angular/platform-browser';

@Component({
  selector: 'app-hello',
  template: `
    <p>Hello from Angular!!</p>

    @if (show()) {
      <p>{{ helpText() }}</p>
    }

    <button (click)="toggle()">Toggle</button>
  `,
})
export class HelloComponent {
  static hydrationFeatures = () => [withEventReplay()];

  helpText = input('help');

  show = signal(false);

  toggle() {
    this.show.update((show) => !show);
  }
}
```

## Using Components in MDX pages

To use components with MDX pages, you must install and configure MDX support by following the Astro integration of [@astrojs/mdx](https://docs.astro.build/en/guides/integrations-guide/mdx/). Your `astro.config.mjs` should now include the `@astrojs/mdx` integration.

```js
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [mdx(), angular()],
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
- Content projection to island components is not supported
