import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Veröffentlichung

Die Node.js-Veröffentlichung ist die Standardvorlage für die Analog Ausgabe der Produktions-Builds.

Beim Ausführen von `npm run build` mit der Standardvorlage ist das Ergebnis ein Einstiegspunkt, der einen betriebsbereiten Node-Server startet.

Um den Standalone-Server zu starten, führe folgendes aus:

```bash
$ node dist/analog/server/index.mjs
Listening on http://localhost:3000
```

### Umgebungsvariablen

Das Serververhalten kann mithilfe der folgenden Umgebungsvariablen angepasst werden:

- `NITRO_PORT` or `PORT` (defaults to `3000`)
- `NITRO_HOST` or `HOST`

## Eingebaute Voreinstellungen

Analog kann verschiedene Ausgabeformate erzeugen, die für verschiedene [Hosting-Anbieter](/de/docs/features/deployment/providers) aus der gleichen Codebasis geeignet sind. Die Voreinstellung können die Bereitstellung können mithilfe einer Umgebungsvariablen oder der `vite.config.ts` geändert werden.

Die Verwendung von Umgebungsvariablen wird für Veröffentlichung die durch CI/CD angestoßen werden empfohlen.

**Beispiel:** Verwendung von `BUILD_PRESET`

```bash
BUILD_PRESET=node-server
```

**Beispiel:** Verwendung von `vite.config.ts`

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    analog({
      nitro: {
        preset: 'node-server',
      },
    }),
  ],
});
```

## Veröffentlichung mit einem benutzerdefinierten URL-Präfix

Wenn mit einem benutzerdefinierte URL-Präfix wie https://domain.com/`basehref`/ veröffentlicht wird, müssen folgende Schritte durchgeführt werden, damit [Server-seitiger Datenabruf](/de/docs/features/data-fetching/server-side-data-fetching), [html markup and assets](https://angular.io/api/common/APP_BASE_HREF) und [dynamische API-Routen](/de/docs/features/api/overview) mit dem angegebenen `basehref` korrekt funktionieren.

1. Weise Angular an, wie es URLs erkennt und generiert. Erstelle eine neue Datei `app.config.env.ts`.

```ts
import { ApplicationConfig } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';

export const envConfig: ApplicationConfig = {
  providers: [{ provide: APP_BASE_HREF, useValue: '/basehref/' }],
};
```

2. Aktualisiere die Datei `app.config.ts`, um die neue Datei zu verwenden.

```ts
import { mergeApplicationConfig } from '@angular/core';
import { envConfig } from './app.config.env';

export const appConfig = mergeApplicationConfig(envConfig, {
....
});
```

3. Im CI-Produktionsbuild

```bash
  # sets the base url for server-side data fetching
  export VITE_ANALOG_PUBLIC_BASE_URL="https://domain.com/basehref"
  # prefixes all assets and html with /basehref/
  npx nx run appname:build:production --baseHref='/basehref/'
```

4. Gebe in Produktionscontainern das env-Flag `NITRO_APP_BASE_URL` an.

```bash
NITRO_APP_BASE_URL="/basehref/"
```

Gegeben sein sollte eine Datei `vite.config.ts` ähnlich dieser:

```ts
    plugins: [
      analog({
        apiPrefix: 'api',
```

Nitro stellt allen API-Routen das Präfix `/basehref/api` voran.
