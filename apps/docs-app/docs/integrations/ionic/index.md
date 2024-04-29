---
sidebar_position: 4
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Ionic Integration with Analog

This tutorial will guide you through the process of integrating Ionic Framework within your Analog application so you can leverage the power of Ionic's iOS and Android components in your applications.

## Step 1: Install Ionic Framework

To begin, you need to install the `@ionic/angular@latest` package. Depending on your preferred package manager, run one of the following commands:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @ionic/angular@latest
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @ionic/angular@latest
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @ionic/angular@latest
```

  </TabItem>
</Tabs>

### Optional: Install Ionic Angular Toolkit for schematics

Ionic also offers a set of schematics that can help you create components following the Ionic structure. You can add them by installing the `@ionic/angular-toolkit` package to your devDependencies

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install -D @ionic/angular-toolkit
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add -D @ionic/angular-toolkit
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -D @ionic/angular-toolkit
```

  </TabItem>
</Tabs>

### Optional: Install Ionicons: Ionic custom icons library

Ionic offers too, an icon library that brings more than 500 icons for most of your mobile application needs. You can install them by adding the `ionicons` package to your project:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install ionicons
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add ionicons
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install ionicons
```

  </TabItem>
</Tabs>

## Step 2: Configuring Ionic Framework in your application

1. Update your `vite.config.ts` file to exclude Ionic packages from the **SSR** process, adding them to the `noExternal` property. ionicons is required only if you installed the ionicons package.

```json
ssr: {
  noExternal: [
    '@ionic/**',
    '@stencil/**',
    'ionicons',
  ],
},
```

2. Add in your `app.config.ts` the `provideIonicAngular` method and `IonicRouteStrategy`provider.

```ts
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
  ],
};
```

3. Update your `app.component.ts` file to set in the template the required Ionic tags. You need to add the `ngSkipHydration` attribute to the `ion-app` tag as [Ionic doesn't yet support client hydration](https://github.com/ionic-team/ionic-framework/issues/28625#issuecomment-1843919548)

```ts
import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'demo-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: ` <ion-app ngSkipHydration>
    <ion-router-outlet></ion-router-outlet>
  </ion-app>`,
})
export class AppComponent {}
```

4. Rename the file `styles.css` to `styles.scss`.
5. Set the `inlineStylesExtension` property to `'scss'` in the `vite.config.ts` file:

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

6. Update the `index.html` file to reference the SCSS file:

```html
<head>
  <!-- other headers -->
  <link rel="stylesheet" href="/src/styles.scss" />
</head>
<body>
  <!-- content -->
</body>
```

7. Update the `styles.scss` file to import the Ionic styles and define your [custom theme](https://ionicframework.com/docs/theming/color-generator):

```scss
/* Core CSS required for Ionic components to work properly */
@import '@ionic/angular/css/core.css';

/* Basic CSS for apps built with Ionic */
@import '@ionic/angular/css/normalize.css';
@import '@ionic/angular/css/structure.css';
@import '@ionic/angular/css/typography.css';
@import '@ionic/angular/css/display.css';

/* Optional CSS utils that can be commented out */
@import '@ionic/angular/css/padding.css';
@import '@ionic/angular/css/float-elements.css';
@import '@ionic/angular/css/text-alignment.css';
@import '@ionic/angular/css/text-transformation.css';
@import '@ionic/angular/css/flex-utils.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* @import "@ionic/angular/css/palettes/dark.always.css"; */
/* @import "@ionic/angular/css/palettes/dark.class.css"; */
@import '@ionic/angular/css/palettes/dark.system.css';
```

## Step 3: Adding Capacitor (Optional)

Capacitor allows you to create web native applications that can be run on iOS and Android devices with ease.

### Step 3.1 Install and configure your Capacitor app

1. First, you need to install the `@capacitor/core` and `@capacitor/cli` packages. Depending on your preferred package manager, run one of the following commands:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @capacitor/core
npm install -D @capacitor/cli
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @capacitor/core
yarn add -D @capacitor/cli
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @capacitor/core
pnpm install -D @capacitor/cli
```

  </TabItem>
</Tabs>

2. Then you have to initialize the Capacitor project with the following command. The CLI will ask you a few questions, starting with your app name, and the package ID you would like to use for your app.

```shell
npx cap init
```

3. Update `capacitor.config.ts` `webDir` property to point to the dist folder of analog build

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ionic.capacitor',
  appName: 'ionic-capacitor',
  webDir: 'dist/client',
};

export default config;
```

### Step 3.2 Create your Android and iOS projects

1. Install the `@capacitor/android` and/or `@capacitor/ios` packages based on the platforms you want to support.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @capacitor/android
npm install @capacitor/ios
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @capacitor/android
yarn add @capacitor/ios
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @capacitor/android
pnpm install @capacitor/ios
```

  </TabItem>
</Tabs>

2. Add the Android and/or iOS project to your app

```shell
npx cap add android
npx cap add ios
```

3. Sync the project files to the installed platforms

```shell
npx cap sync
```

4. You can run the app with the following commands

```shell
npx cap run android
npx cap run ios
```

---

That's it! You have successfully installed and configured Ionic Framework with (or without) Capacitor for your Analog application!
