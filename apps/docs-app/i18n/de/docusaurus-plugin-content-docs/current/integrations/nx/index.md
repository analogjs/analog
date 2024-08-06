---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nx

## Übersicht

[Nx](https://nx.dev) ist ein intelligentes, schnelles, erweiterbares Build-System mit erstklassiger Monorepo-Unterstützung und leistungsfähigen Integrationen.

Analog bietet die Integration mit Nx-Monorepos und -Arbeitsbereichen durch eine Arbeitsbereichsvoreinstellung und einen Anwendungsgenerator. Eine Analog-Anwendung kann als eigenständiges Projekt erstellt oder zu einem bestehenden Nx-Arbeitsbereich hinzugefügt werden.

## Erstellen eines eigenständigen Nx-Projekts

Um ein eigenständiges Nx-Projekt zu erstellen, verwende den Befehl `create-nx-workspace` mit der Voreinstellung `@analogjs/platform`.

Erstellen eines neuen Nx-Arbeitsbereich mit einer vorkonfigurierten Analog-Anwendung:

```shell
npx create-nx-workspace@latest --preset=@analogjs/platform
```

Bei der Analog Voreinstellung wirst du aufgefordert, den Namen Ihrer Anwendung anzugeben. In diesem Beispiel verwenden wir einfach `analog-app`.
Außerdem wirst du gefragt, ob du [TailwindCSS] (https://tailwindcss.com) und [tRPC] (https://trpc.io) in dein neues Projekt aufnehmen möchtest.
Wenn du dich dafür entscheidest, werden alle erforderlichen Abhängigkeiten automatisch installiert,
und alle notwendigen Konfigurationen werden hinzugefügt.

### Bereitstellen der Anwendung

Um den Entwicklungsserver für Ihre Anwendung zu starten, führe den Befehl `nx serve` aus.

```shell
npx nx serve analog-app
```

Navigiere in deinem Browser zu `http://localhost:4200`, um die Anwendung laufen zu sehen.

### Erstellung der Anwendung

Um die Anwendung für die Veröffentlichung zu erstellen, führe folgendes aus:

```shell
npx nx build analog-app
```

### Artefakte bauen

Die Client-Build-Artefakte befinden sich im Ordner dist deines Nx-Arbeitsbereichs.

Im Layout des standalone Arbeitsbereichs befinden sich die Client-Artefakte der `analog-app` im Verzeichnis `dist/analog/public`.
Der Server für die API/SSR-Build-Artefakte befinden sich im Verzeichnis `dist/analog/server`.

## Hinzufügen zu einem bestehenden Nx-Arbeitsbereich

Eine Analog Anwendung kann innerhalb eines bestehenden Nx-Arbeitsbereichs erstellt werden. Um eine Anwendung zu generieren:

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
pnpm install @analogjs/platform --save-dev
```

  </TabItem>
</Tabs>

Als nächstes verwende den Anwendungsgenerator, um eine neue Anwendung zu erstellen:

```shell
npx nx g @analogjs/platform:app analog-app
```
