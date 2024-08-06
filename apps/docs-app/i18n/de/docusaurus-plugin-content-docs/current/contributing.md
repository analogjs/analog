---
sidebar_position: 4
title: Beitragen
---

# Beitragen

Analog ist ein MIT-lizenziertes Open-Source-Projekt, das von den Mitwirkenden ständig weiterentwickelt wird.

## Zum Projekt beitragen

### Struktur der Verzeichnisse

Der Quellcode für das Analog-Framework befindet sich im Ordner `packages/`. Um Funktionen oder Fehlerbehebungen zum Framework beizutragen, suche den entsprechenden Code in einem der `packages`-Unterordner. Zusätzlich zum Unterordner `create-analog` gibt es einen Unterordner für jedes der `npm`-Pakete im Bereich `@analogjs/*`:

- `packages/create-analog` → `create-analog`
- `packages/vite-plugin-angular` → `@analogjs/vite-plugin-angular`

### Einrichtung

Analog verwendet [pnpm](https://pnpm.io/), um seine Abhängigkeiten zu verwalten.

Bevor du eine Pull-Anfrage öffnest, führen Sie den folgenden Befehl im Stammverzeichnis aus, um sicherzustellen, dass Ihre Entwicklungsabhängigkeiten auf dem neuesten Stand sind:

```shell
pnpm i
```

### Lokaler Betrieb

Um die Beispielanwendung lokal bereitzustellen, führen den folgenden Befehl im Stammordner aus:

```shell
pnpm dev
```

### Bauen

Analog verwendet [Nx](https://nx.dev) für Builds. Um alle Projekte lokal zu erstellen, führen den folgenden Befehl im Stammordner aus:

```shell
pnpm build
```

### Testen

Analog verwendet [Vitest](https://vitest.dev) für Tests. Um alle Projekte lokal zu testen, führen den folgenden Befehl im Stammverzeichnis aus:

```shell
pnpm test
```

## Zu den Docs und zur analogjs.org Website beitragen

### Struktur der Verzeichnisse

Der Quellcode für die Analog-Dokumentation und die analogjs.org Website befindet sich im Projektordner `apps/docs-app`. Um Dokumentation oder Website-Inhalte beizusteuern, suchen den entsprechenden Quellcode in einem der Unterordner:

- `blog` - Blog (ungenutzt).
- `docs` - Dokumentationsseiten mit React MDX-Unterstützung.
- `src/components` - React-Komponenten.
- `src/css` - Global Styles.
- `src/pages` - React-Seitenkomponenten.
- `static` - Bilder und andere statische Elemente.

### Einrichtung

Analog verwendet [pnpm](https://pnpm.io/), um seine Abhängigkeiten zu verwalten.

Bevor du eine Pull-Anfrage öffnest, führen Sie den folgenden Befehl im Stammverzeichnis aus, um sicherzustellen, dass Ihre Entwicklungsabhängigkeiten auf dem neuesten Stand sind:

```shell
pnpm i
```

### Lokaler Betrieb

Analog verwendet [Docusaurus](https://docusaurus.io/) zur Entwicklung der Dokumentation und der analogjs.org Website. Führe den folgenden Befehl aus dem Ordner `apps/docs-app` aus, um die Website bereitzustellen:

```shell
pnpm nx serve
```

oder führe alternativ diesen Befehl vom Stammverzeichnis aus:

```shell
pnpm nx serve docs-app
```

Sobald der Entwicklungsserver in Betrieb ist, kann die Dokumentation und die Website unter [http://localhost:3000](http://localhost:3000) eingesehen werden.

### Bauen

Analog verwendet [Nx](https://nx.dev), um die Docs und die analogjs.org-Website zu erstellen. Um die Website lokal zu erstellen, führe den folgenden Befehl aus dem Ordner `apps/docs-app` aus:

```shell
pnpm nx build
```

oder führe alternativ diesen Befehl vom Stammverzeichnis aus:

```shell
pnpm nx build docs-app
```

### Statische Website lokal bereitstellen

Um die generierte statische Website lokal bereitzustellen, führe den folgenden Befehl aus dem Ordner `apps/docs-app` aus:

```shell
pnpm nx serve-static
```

oder führe alternativ diesen Befehl vom Stammverzeichnis aus:

```shell
pnpm nx serve-static docs-app
```

## Einreichen von Pull-Requests

**Bitte befolge diese grundlegenden Schritte, um die Überprüfung von Pull-Anfragen zu vereinfachen. Wenn du das nicht tust, wirst du wahrscheinlich trotzdem darum gebeten.**

- Bitte rebase deinen Branch gegen den aktuellen `beta` Branch.
- Befolge die obigen `Setup`-Schritte, um sicherzustellen, dass die Entwicklungsabhängigkeiten aktuell sind.
- Bitte stelle sicher, dass die Testsuite erfolgreich ist, bevor du einen PR einreichst.
- Wenn neue Funktionen hinzugefügt wurden, **bitte** fügen Tests ein, die das Verhalten dieser Funktionen überprüfen.
- Verweisen Sie auf mögliche [Issues] (https://github.com/analogjs/analog/issues) im PR-Kommentar.
- PRs können mehrere Commits enthalten. Bitte behalte jedoch den Inhalt aller Commits im Zusammenhang. Erstelle separate PRs für unzusammenhängende Änderungen.

### Richtlinien für Pull Request-Titel

Dadurch wird der Commit sowohl auf GitHub als auch in verschiedenen Git-Tools leichter zu lesen.

Beispiele: (noch mehr [Beispiele](https://github.com/analogjs/analog/commits/beta))

```
feat(content): update prismjs to latest version
```

```
fix(content): fix error when rendering markdown
```

### Typ

Muss einer der folgenden sein:

- **build**: Änderungen, die das Build-System oder externe Abhängigkeiten betreffen (Beispielbereiche: gulp, broccoli, npm)
- **ci**: Änderungen an unseren CI-Konfigurationsdateien und Skripten (Beispielbereiche: Travis, Circle, BrowserStack, SauceLabs)
- **docs**: Nur Dokumentation ändert sich
- **feat**: Eine neue Funktion
- **fix**: Eine Fehlerbehebung
- **perf**: Eine Codeänderung, die die Leistung verbessert
- **refactor**: Eine Codeänderung, die weder einen Fehler behebt noch eine Funktion hinzufügt
- **style**: Änderungen, die den Sinn des Codes nicht beeinträchtigen (Leerzeichen, Formatierung, fehlende Semikolons usw.)
- **test**: Hinzufügen fehlender Tests oder Korrigieren vorhandener Tests

### Bereich

Der Bereich sollte der Name des betroffenen npm-Pakets sein (so wie es die Person sieht, die den aus den Commit-Meldungen generierte Changelog liest).

Im Folgenden findest du eine Liste der derzeit unterstützten Bereiche:

- **astro-angular**
- **content**
- **content-plugin**
- **create-analog**
- **nx-plugin**
- **platform**
- **router**
- **trpc**
- **vite-plugin-angular**
- **vite-plugin-nitro**
- **vitest-angular**

### Einschneidende Veränderungen

Falls einschneidende Änderungen vorgenommen werden, sollten diese im Text des Pull Requests erläutert werden.

Beispiel:

```
feat(scope): commit message

BREAKING CHANGES:

Describe breaking changes here

BEFORE:

Previous code example here

AFTER:

New code example here
```

## Einreichen von Fehlerberichten

- Durchsuche die Issues, um festzustellen, ob ein früheres Issue bereits gemeldet und/oder behoben wurde.
- Stellen eine _kleine_ Reproduktion über ein [StackBlitz-Projekt] (https://analogjs.org/new) oder ein GitHub-Repository bereit.
- Bitte geben den/die betroffenen Browser und das/die betroffene(n) Betriebssystem(e) an.
- Bitte geben unbedingt an, welche Version von Angular, Node und Paketmanager (npm, pnpm, yarn) verwendet wird.

## Neue Funktionen einreichen

- Wir legen Wert darauf, die API-Oberfläche klein und übersichtlich zu halten, was sich auf die Akzeptanz neuer Funktionen auswirkt.
- Reichen eine Anfrage mit dem Präfix `Feature:` mit der Feature-Anfrage ein. Verwenden den Präfix `RFC:` für ein großes Feature mit größeren Auswirkungen auf die Codebasis.
- Die Funktion wird diskutiert und geprüft.
- Nachdem der PR eingereicht, geprüft und genehmigt wurde, wird er zusammengeführt.

## Fragen und Anfragen an den Support

Fragen und Supportanfragen sollten nicht als Probleme eröffnet werden, sondern auf folgende Weise behandelt werden:

- Starte eine neue [Q&A Diskussion](https://github.com/analogjs/analog/discussions/new?category=q-a) auf GitHub.
- Starte ein neues Thema im Forum `#help` auf dem [Discord-Server](https://chat.analogjs.org/)
