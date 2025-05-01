---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Angular Material Integration with Analog

This tutorial will guide you through the process of integrating the [Angular Material](https://material.angular.io) component library into your Analog application.

## Step 1: Installing the Angular Material library

To begin, you need to install the `@angular/cdk` and `@angular/material` packages. Depending on your preferred package manager, run one of the following commands:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @angular/cdk @angular/material
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @angular/cdk @angular/material
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @angular/cdk @angular/material
```

  </TabItem>
</Tabs>

## Step 2: Configuring the Angular Material library

1. Rename the `src/styles.css` file to `src/styles.scss`.
2. If you're using `zone.js`, configure the `scss` preprocessorOptions to use the `legacy` api.
3. Set the `inlineStylesExtension` property to `'scss'` in the `vite.config.ts` file:

```ts
export default defineConfig(({ mode }) => {
  return {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'legacy',
        },
      },
    },
    plugins: [
      analog({
        vite: {
          inlineStylesExtension: 'scss',
        },
      }),
    ],
  };
});
```

4. Update the `index.html` file to reference the SCSS file:

```html
<head>
  <!-- other headers -->
  <link rel="stylesheet" href="/src/styles.scss" />
  <link rel="preconnect" href="https://fonts.gstatic.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap"
    rel="stylesheet"
  />
  <link
    href="https://fonts.googleapis.com/icon?family=Material+Icons"
    rel="stylesheet"
  />
</head>
<body class="mat-typography">
  <!-- content -->
</body>
```

5. Update the `styles.scss` file to import the Angular Material styles and define your custom theme:

```scss
@use '@angular/material' as mat;

html {
  color-scheme: light dark;
  @include mat.theme(
    (
      color: mat.$violet-palette,
      typography: Roboto,
      density: 0,
    )
  );
}

body {
  font-family: Roboto, 'Helvetica Neue', sans-serif;
  margin: 0;
  padding: 30px;
  height: 100%;
}

html {
  height: 100%;
}
```

## Optional Step: Configuring Animations

If you want to activate or deactivate animations where needed, follow the correspondent steps:

1. Open the `app.config.ts` file and add `provideAnimations()` as a provider

```ts
providers: [
  // other providers
  provideAnimations(),
],
```

2. Open the `app.config.server.ts` file and add `provideNoopAnimations()` as a provider

```ts
providers: [
  // other providers
  provideNoopAnimations(),
],
```

With these steps, you have configured animations to be enabled on the client and disabled on the server in your Analog application.

That's it! You have successfully installed and configured the Angular Material library for your Analog application. You can now start utilizing the Angular Material components and styles in your project.

For more information on theming with Angular Material, refer to the [Angular Material Theming Guide](https://material.angular.io/guide/theming).
