---
sidebar_position: 4
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Ionic Framework Integration mit Analog

Dieses Tutorial führt durch den Prozess der Integration von Ionic Framework in eine Analog-Anwendung, damit die Leistungsfähigkeit der iOS- und Android-Komponenten von Ionic in einer Anwendungen genutzt werden kann.

## Schritt 1: Ionic Framework installieren

Zu Beginn muss das Paket `@ionic/angular@latest` installiert werden. Je nach bevorzugten Paketmanager führe einen der folgenden Befehle aus:

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

### Optional: Ionic Angular Toolkit für Schemata installieren

Ionic bietet auch eine Reihe von Schemata, die helfen können, Komponenten zu erstellen, die der Ionic-Struktur folgen. Du kannst diese hinzufügen, indem du das Paket `@ionic/angular-toolkit` zu den devDependencies installierst

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

### Optional: Installieren von Ionicons: Ionic Bibliothek mit benutzerdefinierten Symbolen

Ionic bietet auch eine Icon-Bibliothek, die mehr als 500 Icons für die meisten Bedürfnisse einer mobilen Anwendungen enthält. Diese können installiert werden, indem das Paket `ionicons` zu dem Projekt hinzugefügt wird:

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

## Schritt 2: Konfigurieren von Ionic Framework in der Anwendung

1. Aktualisiere die `vite.config.ts`-Datei, um Ionic-Pakete in den **SSR**-Prozess einzubeziehen, indem es zum Array `noExternal` hinzugefügt wird. ionicons ist nur erforderlich, wenn das ionicons-Paket installiert wurde. Wenn du Vitest verwendest, binde das @ionic/angular-Paket ein, damit Vitest dieses Paket korrekt für Vitest bauen kann.

```ts
export default defineConfig(({ mode }) => {
  return {
    // ...

    // add these lines
    ssr: {
      noExternal: ['@ionic/**', '@stencil/**', 'ionicons'],
    },

    // ...

    // add these lines if you use Vitest
    test: {
      server: {
        deps: {
          inline: ['@ionic/angular'],
        },
      },
    },
  };
});
```

2. Füge in der `app.config.ts` die Methode `provideIonicAngular` und den Provider `IonicRouteStrategy` hinzu.

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

3. Aktualisiere die `app.component.ts`-Datei, um in der Vorlage die erforderlichen Ionic-Tags zu setzen. Du solltest dir die [Vorsichtsmaßnahme für serverseitiges Rendern](#vorsichtsmaßnahme-für-serverseitiges-Rendern) ansehen, da [Ionic noch keine Client-Hydrierung unterstützt](https://github.com/ionic-team/ionic-framework/issues/28625#issuecomment-1843919548)

```ts
import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'demo-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>`,
})
export class AppComponent {}
```

4. Benennen Sie die Datei `styles.css` in `styles.scss` um.
5. Setze die Eigenschaft `inlineStylesExtension` in der Datei `vite.config.ts` auf `'scss`:

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

6. Aktualisiere die Datei `index.html`, um auf die SCSS-Datei zu verweisen:

```html
<head>
  <!-- other headers -->
  <link rel="stylesheet" href="/src/styles.scss" />
</head>
<body>
  <!-- content -->
</body>
```

7. Aktualisiere die Datei `styles.scss`, um die Ionic-Styles zu importieren und ein [benutzerdefiniertes Theme](https://ionicframework.com/docs/theming/color-generator) zu definieren:

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

### Vorsichtsmaßnahme für serverseitiges Rendern

Das Ionic Framework [unterstützt nicht Angulars neue Client Hydration](https://github.com/ionic-team/ionic-framework/issues/28625#issuecomment-1843919548), wie Angular [unterstützt es nicht SSR mit Webkomponenten](https://github.com/angular/angular/issues/52275), und wenn sie unterstützt werden, muss an den Stencil-Komponenten gearbeitet werden, um sie zu aktivieren. Im Moment gibt es also drei Möglichkeiten, dies zu handhaben:

1. Entfernen `provideClientHydration()` aus den `app.config.ts` Providern.

- Dies entfernt den neuen Client-Hydrierungsmechanismus von Angular und kehrt zum vorherigen Mechanismus zurück, der ein Flackern verursacht, wenn das DOM vom Client neu gerendert wird.

```ts
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(),
    //provideClientHydration(), // remove this.
    provideHttpClient(withFetch()),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
  ],
};
```

2. Hinzufügen des Attributs `ngSkipHydration` zum Tag `ion-app`.

- Dadurch wird der Client-Hydrierungsmechanismus für das Element `ion-app` und seine Kinder deaktiviert, aber die Client-Hydrierung wird weiterhin für andere Elemente verwendet. Dies wird auch ein Flackern auf der Seite für die Ionic-Komponenten verursachen. Dies ist für andere Elemente/Komponenten nicht sehr hilfreich, da bei Ionic-Apps alle Ionic-Komponenten innerhalb des Tags `ion-app` existieren.

  ```ts
  import { Component } from '@angular/core';
  import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

  @Component({
    selector: 'demo-root',
    standalone: true,
    imports: [IonApp, IonRouterOutlet],
    template: `
      <ion-app ngSkipHydration>
        <ion-router-outlet></ion-router-outlet>
      </ion-app>
    `,
  })
  export class AppComponent {}
  ```

3. SSR vollständig deaktivieren

- Deaktiviere SSR in der Datei `vite.config.ts`. Dadurch **wird das Flackern beseitigt**, aber du verlierst alle Vorteile von SSR in der Anwendung.

  ```ts
  plugins: [
    analog({
      ssr: false,
    }),
  ],
  ```

Du **musst** eine der vorherigen Optionen wählen, da die Nichtkonfiguration dazu führt, dass die Anwendung zur Laufzeit Fehler wie folgende auslöst:

```js
ERROR Error: NG0500: During hydration Angular expected <ion-toolbar> but found a comment node.

Angular expected this DOM:

  <ion-toolbar color="secondary">…</ion-toolbar>  <-- AT THIS LOCATION
  …


Actual DOM is:

<ion-header _ngcontent-ng-c1775393043="">
  <!--  -->  <-- AT THIS LOCATION
  …
</ion-header>

Note: attributes are only displayed to better represent the DOM but have no effect on hydration mismatches.

To fix this problem:
  * check the "AppComponent" component for hydration-related issues
  * check to see if your template has valid HTML structure
  * or skip hydration by adding the `ngSkipHydration` attribute to its host node in a template
```

## Schritt 3: Hinzufügen von Capacitor (optional)

Mit Capacitor können native Webanwendungen erstellt werden, die problemlos auf iOS- und Android-Geräten ausgeführt werden können.

### Schritt 3.1 Installieren und konfigurieren der Capacitor-App

1. Zuerst müssen die Pakete `@capacitor/core` und `@capacitor/cli` installiert werden. Abhängig vom bevorzugten Paketmanager, führen einen der folgenden Befehle aus:

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

2. Dann muss das Capacitor-Projekt mit dem folgenden Befehl initialisiert werden. Die CLI wird einige Fragen stellen, beginnend mit dem Namen der Anwendung und der Paket-ID, die für die Anwendung verwendet werden soll.

```shell
npx cap init
```

3. Aktualisiere die Eigenschaft `webDir` der Datei `capacitor.config.ts` so, dass sie auf den dist-Ordner des Analog Builds zeigt

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ionic.capacitor',
  appName: 'ionic-capacitor',
  webDir: 'dist/analog/public',
};

export default config;
```

### Schritt 3.2 Erstellen des Android- und iOS-Projektes

1. Installiere die Pakete `@capacitor/android` und/oder `@capacitor/ios` basierend auf den Plattformen, die unterstützt werden sollen.

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

2. Füge das Android- und/oder iOS-Projekt zu der App hinzu

```shell
npx cap add android
npx cap add ios
```

3. Synchronisiere die Projektdateien mit den installierten Plattformen

```shell
npx cap sync
```

4. Die App nun mit den folgenden Befehlen ausgeführt werden

```shell
npx cap run android
npx cap run ios
```

---

Das war's! Du hast das Ionic Framework mit (oder ohne) Capacitor für deine Analog-Anwendung erfolgreich installiert und konfiguriert!
