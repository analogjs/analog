---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Angular Material Integration with Analog

This tutorial will guide you through the process of integrating the Angular Material library within your Analog application.

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

1. Rename the file `styles.css` to `styles.scss`.
2. Set the `inlineStylesExtension` property to `'scss'` in the `vite.config.ts` file:

```ts
export default defineConfig(({ mode }) => {
  return {
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

3. Update the `index.html` file to reference the SCSS file:

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

4. Update the `styles.scss` file to import the Angular Material styles and define your custom theme:

```scss
@use '@angular/material' as mat;
@include mat.core();

$analog-primary: mat.define-palette(mat.$indigo-palette);
$analog-accent: mat.define-palette(mat.$pink-palette, A200, A100, A400);
$analog-warn: mat.define-palette(mat.$red-palette);
$analog-theme: mat.define-light-theme(
  (
    color: (
      primary: $analog-primary,
      accent: $analog-accent,
      warn: $analog-warn,
    ),
  )
);

@include mat.all-component-themes($analog-theme);
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
