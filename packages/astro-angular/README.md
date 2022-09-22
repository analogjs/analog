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
  "include": ["src/**/*.ts"]
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
import { HelloComponent } from '../components/hello.component.ts';

const helpText = "Helping binding";
---

<HelloComponent />
<HelloComponent helpText="Helping" />
<HelloComponent helpText={helpText} />
```

To hydrate the component on the client, use one of the Astro directives:

```ts
---
import { HelloComponent } from '../components/hello.component.ts';
---

<HelloComponent client:visible />
```

Find more information about [Client Directives](https://docs.astro.build/en/reference/directives-reference/#client-directives) in the Astro documentation.

## Current Limitations

- Only standalone Angular components in version v14.2+ are supported
- Component Outputs are not supported
