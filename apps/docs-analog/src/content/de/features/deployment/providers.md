import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Anbieter

Analog unterstützt die Veröffentlichung bei vielen Anbietern mit wenig oder gar keiner zusätzlichen Konfiguration unter Verwendung von [Nitro](https://nitro.unjs.io) als zugrunde liegende Server-Engine. Weitere Anbieter sind in den [Nitro veröffentlichungs Dokumentationen](https://nitro.unjs.io/deploy) zu finden.

## Netlify

Analog unterstützt die Veröffentlichung auf [Netlify] (https://netlify.com/) mit minimaler Konfiguration.

### Bereitstellung des Projekts

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="create-analog">
Setze in den Build-Einstellungen des Netlify-Projekts das [Veröffentlichungs-Verzeichnis](https://docs.netlify.com/configure-builds/overview/#definitions) auf `dist/analog/public`, um die statischen Assets bereitzustellen, und das [Funktionsverzeichnis](https://docs.netlify.com/configure-builds/overview/#definitions) auf `dist/analog`, um den Server bereitzustellen.
  </TabItem>

  <TabItem label="Nx" value="nx">
Gehe in den Build-Einstellungen des Netlify-Projekts auf der Web-UI wie folgt vor.

1. Setze den [build-Befehl](https://docs.netlify.com/configure-builds/overview/#definitions) auf `nx build [Ihr-Projektname]`
2. Setze das [Veröffentlichungsverzeichnis] (https://docs.netlify.com/configure-builds/overview/#definitions) auf `dist/[Ihr-Projektname]/analog/public`, um die statischen Assets bereitzustellen
3. Setze das [Funktionsverzeichnis] (https://docs.netlify.com/configure-builds/overview/#definitions) auf `dist/[Ihr-Projektname]/analog`, um den Server bereitzustellen

Das kann auch konfiguriert werden, indem eine `netlify.toml` in das Stammverzeichnis des Repositorys angelegt wird. Unten ist ein Beispiel für eine Konfiguration.

```toml
# ersetze "my-analog-app" durch den Namen der Anwendung, die bereitgestellt werdem soll
[build]
  command = "nx build my-analog-app"
  publish = "dist/my-analog-app/analog/public"
  functions = "dist/my-analog-app/analog"
```

  </TabItem>
</Tabs>

## Vercel

Analog unterstützt die Veröffentlichung auf [Vercel] (https://vercel.com/) ohne zusätzliche Konfiguration.

### Bereitstellung des Projekts

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="create-analog">
Standardmäßig wird bei der Bereitstellung in Vercel die Voreinstellung für die Erstellung automatisch vorgenommen.

1. Erstelle ein neues Projekt und wählen das Repository aus, das den Code enthält.
2. Klicken Sie auf 'Bereitstellen'.

Und das war's auch schon!

  </TabItem>

  <TabItem label="Nx" value="nx">
Damit es mit Nx funktioniert, muss die spezifische Anwendung definiert werden, die erstellt werden soll. Es gibt mehrere Möglichkeiten, dies zu tun, und es kann eine der folgenden Methoden gewählt werden (ersetzen Sie &#60;app&#62; durch Ihren App-Namen):

1. Definiere das `defaultProject` in der `nx.json`.

```json [nx.json]
{
  "defaultProject": "<app>"
}
```

2. Erstelle eine Datei `vercel.json` im Stammverzeichnis des Projekts und definiere den `buildCommand`:

```json [vercel.json]
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "nx build <app>"
}
```

3. Definiere den `buildCommand` in der `package.json`:

```json [package.json]
{
  "scripts": {
    "build": "nx build <app>"
  }
}
```

#### Nx und Vercel

When using Nx and reusing the build cache on the Vercel build platform, there is a possibility that the cache is reused if you have built it locally. This can lead to the output being placed in the wrong location. To resolve this issue, you can use the preset in the `vite.config.ts` file as a workaround.
Wenn Nx verwendet wird und den Build-Cache auf der Vercel-Build-Plattform wiederverwendet wird, besteht die Möglichkeit, dass der Cache wiederverwendet wird, wenn er lokal gebaut wurde. Das kann dazu führen, dass die Ausgabe an der falschen Stelle platziert wird. Um dieses Problem zu lösen, kann die Voreinstellung in der Datei `vite.config.ts` als Workaround verwendet werden.

  </TabItem>
</Tabs>

### Manuelles setzen der Voreinstellung

Es kann der Fall eintreten, dass Vercel die Voreinstellung nicht automatisch lädt. In diesem Fall kann eine der folgenden Möglichkeiten genutzt werden.

- Setze die Umgebungsvariable `BUILD_PRESET` auf `vercel`.
- Lege die Voreinstellung in der Datei `vite.config.ts` fest:

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  /// ...other config
  plugins: [
    analog({
      nitro: {
        preset: 'vercel',
      },
    }),
  ],
}));
```

## Cloudflare Pages

Analog unterstützt die Veröffentlichung auf [Cloudflare](https://cloudflare.com/) Pages mit minimaler Konfiguration.

### Bereitstellung zu Cloudflare

Um das Repository zu verbinden und automatisch bei Cloudflare bereitzustellen:

1. Melden dich beim Cloudflare-Dashboard an und wählen dein Konto aus.
2. Wähle in Account Home die Option Workers & Pages.
3. Wähle Anwendung erstellen > Seiten > Mit Git verbinden aus.
4. Gebe `npm run build` als `Build Command` ein.
5. Gebe `dist/analog/public` als `Build output directory` ein.
6. Belasse die anderen Standardeinstellungen und klicken Sie auf `Save and Deploy`.

Die Anwendung wird bei jedem Push auf das Repository im Cloudflare-Netzwerk bereitgestellt.

#### Nx und Cloudlfare

Bei Nx-Workspaces befindet sich die Build-Ausgabe unter dem Namen der Anwendung. Aktualisiere das `Build output directory` entsprechend.

Zum Beispiel:

Erstelltes Ausgabeverzeichnis: `dist/[Ihr-Projektname]/analog/public`

Um den Build lokal zu testen, führe den folgenden Befehl aus:

```bash
BUILD_PRESET=cloudflare-pages npx nx build [your-project-name]
```

### Lokale Ausführung der Anwendung mit Wrangler

Du kannst die Anwendung, die auf Cloudflare läuft, auch lokal in der Vorschau anzeigen:

1. Setze die Umgebungsvariable `BUILD_PRESET` auf `cloudflare-pages`, vor dem ausführen des Build

```bash
BUILD_PRESET=cloudflare-pages npm run build
```

2. Verwenden Sie die `wrangler` CLI, um die Anwendung lokal auszuführen

```bash
npx wrangler pages dev ./dist/analog/public
```

## Firebase

Analog unterstützt [Firebase Hosting](https://firebase.google.com/docs/hosting) mit Cloud-Funktionen von Haus aus.

Siehe hier ein [Beispielrepo](https://github.com/brandonroberts/analog-angular-firebase-example) mit konfiguriertem Firebase

**Hinweis**: Es wird ein **Blaze-Tarif** benötigt, um Analog mit Cloud Functions zu verwenden.

Wenn noch keine `firebase.json` im Stammverzeichnis existiert, erstellt Analog eine, wenn es zum ersten Mal ausgeführt wird. In dieser Datei muss `<Ihre_Projekt_ID>` durch die ID des Firebase-Projekts ersetzt werden.

Diese Datei sollte dann an die Versionskontrolle übergeben werden. Es kann auch eine `.firebaserc`-Datei erstellt werden, wenn die Projekt-ID nicht manuell an den `firebase`-Befehle übergeben werden soll (mit `--project <Ihre_project_id>`):

```json [.firebaserc]
{
  "projects": {
    "default": "<your_project_id>"
  }
}
```

Füge dann einfach die Firebase-Abhängigkeiten zum Projekt hinzu:

```bash
npm install -D firebase-admin firebase-functions firebase-functions-test
```

### Firebase CLI verwenden

Wenn du es vorziehst, das Projekt mit der Firebase CLI einzurichten, die die Projekt-ID für dich abruft, die erforderlichen Abhängigkeiten (siehe oben) hinzufügt und sogar automatische Bereitstellungen mit GitHub Actions einrichtet.

#### Firebase CLI global installieren

```bash
npm install -g firebase-tools
```

**Hinweis**: Du musst auf [^11.18.0] (https://github.com/firebase/firebase-tools/releases/tag/v11.18.0) sein, um eine nodejs18-Funktion einzusetzen.

#### Initialisieren das Firebase-Projekt

Melden dich bei Firebase an und wähle die Optionen **Hosting** und **Funktionen** wie unten gezeigt:

```bash
firebase login
firebase init
 ◉ Functions: Configure a Cloud Functions directory and its files
 ◉ Hosting: Configure files for Firebase Hosting and (optionally) set up
GitHub Action deploys
```

Wenn kein bestehendes Firebase-Projekt existiert, wählen **Create a new project**, um fortzufahren. Firebase wird ein neues Projekt bereitstellen und die URL für den Zugriff auf die Webkonsole zur Verwaltung des Projekts angeben.

Sobald das Projekt erstellt ist, wähle **TypeScript** als Sprache für die Erstellung von Cloud-Funktionen. Fahre mit dem Akzeptieren der Standardparameter durch das drücken von _Enter_ fort.

Wenn nach dem **public directory** gefragt wird, gebe `dist/analog/public` ein.

Wähle im nächsten Schritt die Standardoption N, um anzugeben, ob die Konfiguration als **Single-Page-App** erfolgen soll. Das ist wichtig! **Konfigurieren Sie** Ihr Projekt **nicht** als Single-Page-App.

Stelle nach Abschluss der Einrichtung sicher, dass die folgenden Eigenschaften in der Datei `firebase.json` korrekt konfiguriert sind. Dadurch wird sichergestellt, dass die serverseitige Darstellung mit Cloud Functions ordnungsgemäß funktioniert:

```json [firebase.json]
{
  "functions": {
    "source": "dist/analog/server"
  },
  "hosting": [
    {
      "site": "<your_project_id>",
      "public": "dist/analog/public",
      "cleanUrls": true,
      "rewrites": [
        {
          "source": "**",
          "function": "server"
        }
      ]
    }
  ]
}
```

Weitere Einzelheiten findest du in der [Firebase-Dokumentation](https://firebase.google.com/docs/hosting/quickstart).

### Firebase-Funktionen

Stelle sicher, dass die Firebase-Funktionen wie im vorherigen Abschnitt beschrieben eingerichtet sind. Als Nächstes muss [Nitro](overview) richtig konfiguriert werden, damit Firebase Cloud Functions funktionieren.

Aktualisiere in `vite.config.ts` die Eigenschaft `nitro` mit den Konfigurationsoptionen, die deinen Anforderungen entsprechen, wie z. B. der Node.js-Version und bevorzugte Region.

```js [vite.config.ts]
nitro: {
  preset: 'firebase',
  firebase: {
    nodeVersion: '20',
    gen: 2,
    httpsOptions: {
      region: 'us-east1',
      maxInstances: 100,
    },
  },
},
```

### Lokale Vorschau

Du kannst eine lokale Version der Seite in der Vorschau anzeigen, um sie ohne Bereitstellung zu testen.

```bash
BUILD_PRESET=firebase npm run build
firebase emulators:start
```

### Bereitstellen auf Firebase Hosting mithilfe der CLI

Um auf Firebase Hosting bereitzustellen, führe den Befehl `firebase deploy` aus.

```bash
BUILD_PRESET=firebase npm run build
firebase deploy
```

### Firebase-Warnungen

Beim Konfigurieren oder Bereitstellen von Firebase werden möglicherweise Warnungen wie die folgenden angezeigt:

```
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: undefined,
npm WARN EBADENGINE   required: { node: '18' },
npm WARN EBADENGINE   current: { node: 'v20.11.0', npm: '10.2.4' }
npm WARN EBADENGINE }
```

```
 ⚠  functions: Couldn't find firebase-functions package in your source code. Have you run 'npm install'?
```

Das sind harmlose Fehler und können ignoriert werden, solange du sicherstellst, dass die Umgebungskonfiguration mit `Nitro` übereinstimmt.

## Render.com

Analog unterstützt die Bereitstellung auf [Render](https://render.com/) mit minimaler Konfiguration.

### Bereitstellung vom Webdienst

1. [Erstelle einen neuen Webdienst](https://dashboard.render.com/select-repo?type=web) und wähle das Repository, das den Code enthält.
2. Vergewisser dich, dass die Umgebung 'Node' ausgewählt ist.
3. [Gebe die Node-Version an, die Render verwenden soll](https://render.com/docs/node-version) (v18.13.0 oder höher empfohlen) - Render verwendet standardmäßig Node 14, das eine Analog Webseite nicht korrekt erstellen kann
4. Abhängig von eingesetzten Paketmanager setze den Build-Befehl auf `yarn && yarn build`, `npm install && npm run build`, oder `pnpm i --shamefully-hoist && pnpm build`.
5. Aktualisiere den Startbefehl auf `node dist/analog/server/index.mjs`
6. Klicke auf 'Advanced' und füge eine Umgebungsvariable hinzu, in der `BUILD_PRESET` auf `render-com` gesetzt ist.
7. Klicke auf 'Create Web Service'

### Bereitstellung einer statischen Website

Wenn Analog zum Vorberechnen statischer Inhalte verwendet wird, kann eine statische Website mit minimaler Konfiguration über Render bereitgestellt wird.

1. [Eine neue statische Website erstellen](https://dashboard.render.com/select-repo?type=static) und wählen das Repository, das den Code enthält.
2. Abhängig von eingesetzten Paketmanager setze den Build-Befehl auf `yarn && yarn build`, `npm install && npm run build`, oder `pnpm i --shamefully-hoist && pnpm build`.
3. Setze das Veröffentlichungsverzeichnis auf das Verzeichnis `public` innerhalb des `dist`-Build-Verzeichnisses (z.B. `dist/analog/public`)
4. Klicke auf 'Create Static Site'

## Edgio

Analog unterstützt die Bereitstellung auf [Edgio] (https://edg.io) mit minimaler Konfiguration.

1. Installiere die Edgio CLI:

```bash
npm i -g @edgio/cli
```

2. Initialisiere Edgio im Verzeichnis des Projekts:

```bash
edgio init --connector=@edgio/analogjs
```

3. Veröffentliche in Edgio

```bash
edgio deploy
```

## GitHub Pages (Bereitstellung statischer Websites)

Analog unterstützt die Bereitstellung einer statischen Website auf [GitHub Pages](https://pages.github.com/).
Wenn die Website auf GitHub Pages bereitstellen, muss eine leere Datei namens `.nojekyll` im Stammverzeichnis des `gh-pages`-branches hinzufügen.

Die Bereitstellung kann mit der Action [Analog Publish Github Pages](https://github.com/marketplace/actions/analog-publish-github-pages) automatisiert werden:

```yaml
name: Build and Deploy

on:
  push:
    branches:
      - 'main'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - uses: k9n-dev/analog-publish-gh-pages@v1.0.0
        with:
          access-token: ${{ secrets.ACCESS_TOKEN }}
          # further options are available.
          # see: https://github.com/marketplace/actions/analog-publish-github-pages
```

Es kann aber auch wie hier selbst erstellt werden:

```yaml
name: Build Deploy

on:
  push:
    branches:
      - '*' # deploy on all branches (but a --dry-run flag is added for branches (see code below))

env:
  TARGET_DIR: dist/analog/public

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - name: Set environment variable based on branch
        run: |
          if [[ $GITHUB_REF == refs/heads/main || $GITHUB_REF == refs/heads/master ]]; then
            echo "Branch is main or master. Setting DRY_RUN_OPTION to empty."
            echo "DRY_RUN_OPTION=" >> $GITHUB_ENV
          else
            echo "Branch is not main or master. Setting DRY_RUN_OPTION to '--dry-run'."
            echo "DRY_RUN_OPTION=--dry-run" >> $GITHUB_ENV
          fi
      - name: Install
        run: npm ci
      - name: Build
        run: npm run build
      - name: Deploy Website (gh-pages branch)
        env:
          GH_TOKEN: ${{ secrets.ACCESS_TOKEN }} # A token must be created to be able to deploy on the gh-pages branch
          CNAME_OPTION: --cname=yourdomain.dev # omit if your not running it on a custom domain
        run: |
          echo "DRY_RUN_OPTION=$DRY_RUN_OPTION"
          npx angular-cli-ghpages --no-silent --dir="${{env.TARGET_DIR}}" $CNAME_OPTION $DRY_RUN_OPTION
```
