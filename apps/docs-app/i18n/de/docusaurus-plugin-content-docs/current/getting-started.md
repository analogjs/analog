---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Erste Schritte

## Systemanforderungen

Analog benötigt die folgenden Node- und Angular-Versionen:

- Node v18.13.0 und höher wird empfohlen
- Angular v15 oder höher

## Erstellen einer neuen Anwendung

Um ein neues Analog-Projekt zu erstellen, kannst du das Paket `create-analog` mit dem Paketmanager Ihrer Wahl verwenden:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm create analog@latest
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog
```

  </TabItem>
</Tabs>

Du kannst auch [ein neues Projekt mit Nx einrichten](/docs/integrations/nx).

### Bereitstellung der Anwendung

Um den Entwicklungsserver für die Anwendung zu starten, führe den Befehl `start` aus.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run start
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn start
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm start
```

  </TabItem>
</Tabs>

Besuche [http://localhost:5173](http://localhost:5173) in deinem Browser, um die laufende Anwendung zu sehen.

Als nächstes kannst du [zusätzliche Routen mit Hilfe von Komponenten](/de/docs/features/routing/overview) für die Navigation definieren.

### Erstellung der Anwendung

So erstellst du die Anwendung für die Veröffentlichung

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run build
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn build
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run build
```

  </TabItem>
</Tabs>

### Artefakte bauen

Standardmäßig ist bei Analog das [Server-Side Rendering](/de/docs/features/server/server-side-rendering) aktiviert.
Die Client-Artefakte befinden sich im Verzeichnis `dist/analog/public`.
Der Server für die API/SSR-Build-Artefakte befindet sich im Verzeichnis `dist/analog/server`.

## Migration einer bestehenden Anwendung

Du kannst auch eine bestehende Angular-Anwendung zu Analog migrieren. Siehe den [Migrationsleitfaden](/de/docs/guides/migrating) für Migrationsschritte.
