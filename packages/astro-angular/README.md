# @analogjs/astro-angular

An [Angular](https://angular.io) integration for rendering components in [Astro](https://astro.build)

## Setup

### Using the Astro CLI

Use the `astro add` command to install the integration

```sh
astro add @analogjs/astro-angular
```

This command:

- Installs the `@analogjs/astro-angular` package.
- Adds the `@analogjs/astro-angular` integration to the `astro.config.mjs` file.
- Installs the necessary dependencies to render Angular components on the server and client, and common Angular dependencies, such as `@angular/common` and `@angular/forms`.

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
    "strictTemplates": true
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
yarn add @analogjs/astro-angular --dev
```

### Install the necessary Angular dependencies

```sh
yarn add @angular-devkit/build-angular, @angular/animations, @angular/common, @angular/compiler-cli, @angular/compiler, @angular/core, @angular/language-service, @angular/forms, @angular/platform-browser, @angular/platform-browser-dynamic, @angular/platform-server, rxjs, zone.js, tslib --dev
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
        tsconfig: 'path/to/tsconfig.app.json',
        workspaceRoot: 'rootDir',
        inlineStylesExtension: 'scss|sass|less|styl|stylus'
      },
    }),
  ],
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

```ts
---
import { HelloComponent } from '../components/hello.component';

const helpText = "Helping binding";
---

<HelloComponent />
<HelloComponent helpText="Helping" />
<HelloComponent helpText={helpText} />
```

To hydrate the component on the client, use one of the Astro [client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives):

```ts
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible />
```

Find more information about [Client Directives](https://docs.astro.build/en/reference/directives-reference/#client-directives) in the Astro documentation.

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
layout: "../../layouts/BlogPost.astro"
title: "Using Angular in MDX"
description: "Lorem ipsum dolor sit amet"
pubDate: "Sep 22 2022"
---

import { HelloComponent } from "../../components/hello.component.ts";

<HelloComponent />
<HelloComponent helpText="Helping" />
```

To hydrate the component on the client, use one of the Astro [client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives):

```md
---
layout: "../../layouts/BlogPost.astro"
title: "Using Angular in MDX"
description: "Lorem ipsum dolor sit amet"
pubDate: "Sep 22 2022"
---

import { HelloComponent } from "../../components/hello.component.ts";

<HelloComponent client:load />
<HelloComponent client:visible helpText="Helping" />
```

> Important: In `.mdx` files the component import must end with the `.ts` suffix. Otherwise the dynamic import of the component will fail and the component won't be hydrated.

## Current Limitations

- Only standalone Angular components in version v14.2+ are supported
- Component Outputs are not supported
