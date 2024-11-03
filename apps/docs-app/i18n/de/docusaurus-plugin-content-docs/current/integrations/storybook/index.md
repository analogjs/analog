---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Verwendung von Storybook mit Angular und Vite

[Storybook](https://storybook.js.org) ist ein Frontend-Workshop für die isolierte Erstellung von UI-Komponenten und Seiten.

Angular und Storybook verwenden standardmäßig Webpack zum Erstellen und Bereitstellen der Storybook-Anwendung.

Dieser Leitfaden führt dich durch den Prozess der Umstellung auf die Erstellung und Bereitstellung deines Storybooks mit Angular unter Verwendung von Vite. Dieser Prozess kann auf _jedes_ Angular-Projekt mit Storybook angewendet werden.

## Storybook einrichten

Ist Storybook noch nicht eingerichtet, führen den folgenden Befehl aus, um Storybook für das Projekt zu initialisieren:

```sh
npx storybook@latest init
```

Folge den Anweisungen und übernehme deine Änderungen.

## Storybook und Vite-Pakete installieren

Installieren das Vite-Plugin für Angular und den Vite Builder für Storybook. Führe je nach bevorzugtem Paketmanager einen der folgenden Befehle aus:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @storybook/builder-vite --save-dev
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @storybook/builder-vite --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/vite-plugin-angular @storybook/builder-vite -w --save-dev
```

  </TabItem>

  <TabItem value="bun">

```shell
bun install @analogjs/vite-plugin-angular @storybook/builder-vite --save-dev
```

  </TabItem>  
</Tabs>

## Konfigurieren von Storybook zur Verwendung des Vite Builder

Aktualisieren die Datei `.storybook/main.ts`, um `@storybook/builder-vite` zu verwenden, und fügen die Konfigurationsfunktion `viteFinal` hinzu, um das Vite-Plugin für Angular zu konfigurieren.

```ts
import { StorybookConfig } from '@storybook/angular';
import { StorybookConfigVite } from '@storybook/builder-vite';
import { UserConfig } from 'vite';

const config: StorybookConfig & StorybookConfigVite = {
  // other config, addons, etc.
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: undefined,
      },
    },
  },
  async viteFinal(config: UserConfig) {
    // Merge custom configuration into the default config
    const { mergeConfig } = await import('vite');
    const { default: angular } = await import('@analogjs/vite-plugin-angular');

    return mergeConfig(config, {
      // Add dependencies to pre-optimization
      optimizeDeps: {
        include: [
          '@storybook/angular',
          '@storybook/angular/dist/client',
          '@angular/compiler',
          '@storybook/blocks',
          'tslib',
        ],
      },
      plugins: [angular({ jit: true, tsconfig: './.storybook/tsconfig.json' })],
    });
  },
};
```

Entferne die `webpackFinal`-Konfigurationsfunktion, falls vorhanden.

Aktualisiere als Nächstes die `package.json`, um die Storybook-Befehle direkt auszuführen.

```json
{
  "name": "my-app",
  "scripts": {
    "storybook": "storybook dev --port 4400",
    "build-storybook": "storybook build"
  }
}
```

> Du kannst auch die Storybook-Ziele in der Datei angular.json entfernen.

Wenn du [Nx](https://nx.dev) verwendest, aktualisiere deine `project.json`-Storybook-Ziele, um die Storybook-Befehle auszuführen:

```json
    "storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook dev --port 4400"
      }
    },
    "build-storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook build --output-dir ../../dist/storybook/my-app"
      }
    }
```

Füge den Ordner `/storybook-static` zu deiner `.gitignore`-Datei hinzu.

## Starten von Storybook

Führe die Storybook-Befehle direkt aus, um den Entwicklungsserver zu starten.

```sh
npm run storybook
```

## Erstellen von Storybook

Führe die Storybook-Befehle aus, um das Storybook zu erstellen.

```sh
npm run build-storybook
```
