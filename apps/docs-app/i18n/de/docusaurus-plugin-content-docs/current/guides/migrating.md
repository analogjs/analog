import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrieren einer Angular-Anwendung zu Analog

Eine bestehende Angular Single Page Application kann mit Hilfe eines Schemas/Generators für Angular CLI oder Nx Workspaces für die Verwendung von Analog konfiguriert werden.

> Analog ist kompatibel mit Angular v15 und höher.

## Verwendung eines Schemas/Generators

Installiere zunächst das Paket `@analogjs/platform`:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/platform --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/platform --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/platform
```

  </TabItem>
</Tabs>

Führe anschließend den Befehl aus, um die Vite-Konfiguration einzurichten, aktualisiere die Build/Serve-Ziele in der Projektkonfiguration, verschieben die erforderlichen Dateien und richte optional Vitest für Unit-Tests ein.

```shell
npx ng generate @analogjs/platform:init --project [your-project-name]
```

Für Nx-Projekte:

```shell
npx nx generate @analogjs/platform:init --project [your-project-name]
```

## Aktualisierung der globalen Stile und Skripte

Wenn globale Skripte oder Stile in der `angular.json` konfiguriert sind, verschiebe diese in den `head`-Tag in der `index.html`.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Analog app</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```
