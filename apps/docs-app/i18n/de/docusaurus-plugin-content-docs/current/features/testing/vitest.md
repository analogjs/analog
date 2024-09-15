import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Hinzufügen von Vitest zu einem bestehenden Projekt

[Vitest](https://vitest.dev) kann mit wenigen Schritten zu bestehenden Angular-Workspaces hinzugefügt werden.

## Verwendung eines Schemas/Generators

Vitest kann mit Hilfe eines Schemas/Generators für Angular CLI- oder Nx-Workspaces installiert und eingerichtet werden.

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
pnpm install -w @analogjs/platform --save-dev
```

  </TabItem>
</Tabs>

Führe anschließend das Schema aus, um die Vite-Konfiguration und die Testkonfigurationsdateien einzurichten und die Testkonfiguration zu aktualisieren.

```shell
ng g @analogjs/platform:setup-vitest --project [your-project-name]
```

Gehe dann zu [Tests durchführen](#tests-durchführen)

## Manuelle Installation

Um Vitest manuell hinzuzufügen, installiere die erforderlichen Pakete:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --save-dev
```

  </TabItem>
</Tabs>

## Einrichtung für die Durchführung von Tests für Node

Um Vitest einzurichten, erstelle eine `vite.config.ts` im Stammverzeichnis des Projekts:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

Als nächstes wird eine Datei `src/test-setup.ts` definiert, um das `TestBed` einzurichten:

```ts
import '@analogjs/vitest-angular/setup-zone';

import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
```

Als Nächstes aktualisiere das Ziel `test` in der Datei `angular.json`, um den Builder `@analogjs/vitest-angular:test` zu verwenden:

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "your-project": {
      "projectType": "application",
      "architect": {
        "build": ...,
        "serve": ...,
        "extract-i18n": ...,
        "test": {
          "builder": "@analogjs/vitest-angular:test"
        }
      }
    }
  }
}
```

> Du kannst auch ein neues Ziel hinzufügen und es `vitest` nennen, um es neben deinem `test`-Ziel auszuführen.

Schließlich füge die Datei `src/test-setup.ts` zum Array `files` in der Datei `tsconfig.spec.json` im Stammverzeichnis des Projekts hinzu, setze das `target` auf `es2016` und aktualisiere die `types`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "target": "es2016",
    "types": ["vitest/globals", "node"]
  },
  "files": ["src/test-setup.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

Gehe dann zu [Tests durchführen](#tests-durchführen)

## Einrichtung für die Ausführung von Tests im Browser

Wenn die Tests lieber in einem Browser durchgeführt werden sollen, bietet Vitest auch experimentelle Unterstützung für Browsertests.

Führe zunächst die Schritte für die [Einrichtung für die Durchführung von Tests für Node](#einrichtung-für-die-durchführung-von-tests-für-node) aus.

Installiere dann die erforderlichen Pakete für die Ausführung von Tests im Browser:

<Tabs groupId="package-manager-browser">
  <TabItem value="npm">

```shell
npm install @vitest/browser playwright --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @vitest/browser playwright --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @vitest/browser playwright
```

  </TabItem>
</Tabs>

Aktualisiere das Objekt `test` in der Datei `vite.config.ts`.

- Entferne die Eigenschaft `environment: 'jsdom'`.
- Füge eine `browser`-Konfiguration für Vitest hinzu.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    // environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Vitest browser config
    browser: {
      enabled: true,
      name: 'chromium',
      headless: false, // set to true in CI
      provider: 'playwright',
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

## Tests durchführen

Um Unit-Tests durchzuführen, verwende den Befehl `test`:

<Tabs groupId="package-manager-node">
  <TabItem value="npm">

```shell
npm run test
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn test
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm test
```

  </TabItem>
</Tabs>

## Snapshot-Tests

Für Snapshot-Tests kann `toMatchSnapshot` aus der API `expect` verwendet werden.

Im Folgenden findest du ein kleines Beispiel für die Erstellung eines Snapshot-Tests:

```ts
// card.component.spec.ts

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardComponent } from './card.component';

describe('CardComponent', () => {
  let fixture: ComponentFixture<CardComponent>;
  let component: CardComponent;

  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CardComponent],
    }),
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(fixture).toMatchSnapshot();
  });
});
```

Nachdem der Test ausgeführ wurde, wird im Ordner `__snapshots__` eine Datei `card.component.spec.ts.snap` mit dem folgenden Inhalt erstellt:

```ts
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[`CardComponent > should create the app 1`] = `
  <component-code>
`;
```

Die erstellten Snapshots sollten überprüft und zur Versionskontrolle hinzugefügt werden.

## Verwendung von TypeScript-Konfigurationspfad-Aliasen

Wenn `paths` in der `tsconfig.json` verwendet werden, kann die Unterstützung für diese Aliase in der `vite.config.ts` hinzufügt werden.

### Mit Angular-CLI

Installiere zunächst das Paket `vite-tsconfig-paths`.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install vite-tsconfig-paths --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add vite-tsconfig-paths --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w vite-tsconfig-paths --save-dev
```

  </TabItem>
</Tabs>

Als Nächstes füge das Plugin zum Array `plugins` in der Datei `vite.config.ts` hinzu, wobei `root` als relativer Pfad zum Stamm des Projekts festgelegt wird.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), viteTsConfigPaths()],
}));
```

### Mit Nx

Für Nx-Arbeitsbereiche importiere und verwende das Plugin `nxViteTsPaths` aus dem Paket `@nx/vite`.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), nxViteTsPaths()],
}));
```
