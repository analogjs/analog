---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Angular Material Integration mit Analog

Dieses Tutorial führt dich durch den Prozess der Integration der Angular Material-Bibliothek in deine Analog-Anwendung.

## Schritt 1: Installieren der Angular Material-Bibliothek

Um zu beginnen, müssen die Pakete `@angular/cdk` und `@angular/material` installiert werden. Je nach bevorzugten Paketmanager führen eine der folgenden Befehle aus:

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

## Schritt 2: Konfigurieren der Angular Material-Bibliothek

1. Benennen die Datei `styles.css` in `styles.scss` um.
2. Setze die Eigenschaft `inlineStylesExtension` in der Datei `vite.config.ts` auf `'scss`:

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

3. Aktualisiere die Datei `index.html`, um auf die SCSS-Datei zu verweisen:

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

4. Aktualisiere die Datei `styles.scss`, um die Angular-Material-Stile zu importieren und das benutzerdefinierte Thema zu definieren:

```scss
@use '@angular/material' as mat;

$theme: mat.define-theme(
  (
    color: (
      theme-type: light,
      primary: mat.$azure-palette,
      tertiary: mat.$blue-palette,
    ),
  )
);

body {
  @include mat.all-component-themes($theme);
  font-family: Roboto, 'Helvetica Neue', sans-serif;
  margin: 0;
  padding: 30px;
  height: 100%;
}

html {
  height: 100%;
}

@include mat.core();
@include mat.color-variants-backwards-compatibility($theme);
```

## Optionaler Schritt: Konfigurieren von Animationen

Wenn du bei Bedarf Animationen aktivieren oder deaktivieren möchtest, führen die entsprechenden Schritte aus:

1. Öffne die Datei `app.config.ts` und fügen `provideAnimations()` als provider hinzu

```ts
providers: [
  // other providers
  provideAnimations(),
],
```

2. Öffne die Datei `app.config.server.ts` und füge `provideNoopAnimations()` als provider hinzu

```ts
providers: [
  // other providers
  provideNoopAnimations(),
],
```

Mit diesen Schritten sind Animationen so konfiguriert, dass sie auf dem Client aktiviert und auf dem Server in der Analog-Anwendung deaktiviert sind.

Das war's! Du hast die Angular Material-Bibliothek für die Analog-Anwendung erfolgreich installiert und konfiguriert. Du kannst nun damit beginnen, die Komponenten und Styles von Angular Material im Projekt zu verwenden.

Weitere Informationen zum Theming mit Angular Material findest du in dem [Angular Material Theming Guide](https://material.angular.io/guide/theming).
