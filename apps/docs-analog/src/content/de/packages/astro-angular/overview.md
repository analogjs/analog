---
title: ''
---

# @analogjs/astro-angular

[Astro](https://astro.build) ist ein modernes Web-Framework, das für die Erstellung schneller, inhaltsorientierter Websites entwickelt wurde und mit allen wichtigen Frontend-Frameworks kompatibel ist. Obwohl es in erster Linie ein Werkzeug für die statische Website-Generierung (SSG) ist, kann es auch dynamische Komponenten, sogenannte "islands", integrieren, die eine "partial hydration" unterstützen.

Dieses Paket ermöglicht das Rendern von [Angular](https://angular.dev) Komponenten als "islands" in Astro.

## Einrichtung

### Astro CLI verwenden

Verwende den Befehl `astro add`, um die Integration zu installieren

Mit npm:

```sh
npx astro add @analogjs/astro-angular
```

Mit pnpm:

```sh
pnpm astro add @analogjs/astro-angular
```

Mit yarn:

```sh
yarn astro add @analogjs/astro-angular
```

Dieser Befehl:

- Installiert das Paket `@analogjs/astro-angular`.
- Fügt die Integration von `@analogjs/astro-angular` zur Datei `astro.config.mjs` hinzu.
- Installiert die notwendigen Abhängigkeiten zum Rendern von Angular-Komponenten auf dem Server und dem Client sowie allgemeine Angular-Abhängigkeiten, wie `@angular/common`.

### Einrichten der TypeScript-Konfiguration

Die Integration benötigt eine `tsconfig.app.json` im Stammverzeichnis des Projekts zur Kompilierung.

Erstelle eine `tsconfig.app.json` im Stammverzeichnis des Projekts.

```json
{
  "extends": "./tsconfig.json",
  "compileOnSave": false,
  "compilerOptions": {
    "baseUrl": "./",
    "outDir": "./dist/out-tsc",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "sourceMap": true,
    "declaration": false,
    "downlevelIteration": true,
    "experimentalDecorators": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "noEmit": false,
    "target": "es2020",
    "module": "es2020",
    "lib": ["es2020", "dom"],
    "skipLibCheck": true
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true,
    "allowJs": false
  },
  "files": [],
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Gehe zu [Definieren einer Komponente](#definieren-einer-komponente), um eine Angular-Komponente hinzufügen zur Verwendung in einer Astro-Komponente einzurichten.

## Manuelle Installation

Die Integration kann auch manuell installiert werden

### Installation der Astro-Integration

```sh
yarn add @analogjs/astro-angular
```

### Installation der notwendigen Angular-Abhängigkeiten

```sh
yarn add @angular-devkit/build-angular @angular/{animations,common,compiler-cli,compiler,core,language-service,forms,platform-browser,platform-browser-dynamic,platform-server} rxjs zone.js tslib
```

### Hinzufügen der Integration

Füge die Integration in die Datei `astro.config.mjs` ein.

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular()],
});
```

Weiter zu [Definieren einer Komponente](#definieren-einer-komponente)

## Konfiguration

### Vite Angular Plugin konfigurieren

Geben Sie ein Optionsobjekt an, um das `@analogjs/vite-plugin-angular` zu konfigurieren, das dieses Plugin antreibt.

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [
    angular({
      vite: {
        inlineStylesExtension: 'scss|sass|less',
      },
    }),
  ],
});
```

### Pakete für SSR-Kompatibilität umwandeln

Um sicherzustellen, dass Angular-Bibliotheken während des SSR-Prozesses von Astro umgewandelt werden, füge diese dem Array `ssr.noExternal` in der Vite-Konfiguration hinzu.

```js
import { defineConfig } from 'astro/config';

import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular()],
  vite: {
    ssr: {
      // transform these packages during SSR. Globs supported
      noExternal: ['@rx-angular/**'],
    },
  },
});
```

## Definieren einer Komponente

Die Astro-Angular-Integration unterstützt **nur** das Rendern von standalone Komponenten:

```ts
import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-hello',
  standalone: true,
  imports: [NgIf],
  template: `
    <p>Hello from Angular!!</p>

    <p *ngIf="show">{{ helpText }}</p>

    <button (click)="toggle()">Toggle</button>
  `,
})
export class HelloComponent {
  @Input() helpText = 'help';

  show = false;

  toggle() {
    this.show = !this.show;
  }
}
```

Füge die Angular-Komponente zur Vorlage der Astro-Komponente hinzu. Dadurch wird nur der HTML-Code der Angular-Komponente gerendert.

```tsx
---
import { HelloComponent } from '../components/hello.component';

const helpText = "Helping binding";
---

<HelloComponent />
<HelloComponent helpText="Helping" />
<HelloComponent helpText={helpText} />
```

Um die Komponente auf dem Client zu hydrieren, verwende eine der Astro-[Client-Direktiven](https://docs.astro.build/en/reference/directives-reference/#client-directives):

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible />
```

Weitere Informationen über [Client Directives](https://docs.astro.build/en/reference/directives-reference/#client-directives) findest du in der Astro-Dokumentation.

### Abhören der Komponentenausgänge

Ausgaben, die von der Angular-Komponente ausgegeben werden können, werden als HTML-Ereignisse an die Astro-Insel weitergeleitet.
Um diese Funktion zu aktivieren, füge eine Client-Direktive und eine eindeutige `[data-analog-id]`-Eigenschaft zu jeder Angular-Komponente hinzu:

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible data-analog-id="hello-component-1" />
```

Dann höre auf das Ereignis in der Astro-Komponente mit der Funktion `addOutputListener`:

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible data-analog-id="hello-component-1" />

<script>
  import { addOutputListener } from '@analogjs/astro-angular/utils';

  addOutputListener('hello-component-1', 'outputName', (event) => {
    console.log(event.detail);
  });
</script>
```

## Hinzufügen von Komponentenprovidern

Zusätzliche Provider können zu einer Komponente für statisches Rendering und Client-Hydrierung hinzugefügt werden.

Diese sind `renderProviders` bzw. `clientProviders`. Diese Provider sind als statische Arrays in der Komponenten Klasse definiert und werden registriert, wenn die Komponente gerendert wird, und auf dem Client hydriert.

```ts
import { Component, OnInit, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { provideHttpClient, HttpClient } from '@angular/common/http';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-todos',
  standalone: true,
  imports: [NgFor],
  template: `
    <h2>Todos</h2>

    <ul>
      <li *ngFor="let todo of todos">
        {{ todo.title }}
      </li>
    </ul>
  `,
})
export class TodosComponent implements OnInit {
  static clientProviders = [provideHttpClient()];
  static renderProviders = [];

  http = inject(HttpClient);
  todos: Todo[] = [];

  ngOnInit() {
    this.http
      .get<Todo[]>('https://jsonplaceholder.typicode.com/todos')
      .subscribe((todos) => (this.todos = todos));
  }
}
```

## Verwendung von Komponenten in MDX-Seiten

Um Komponenten mit MDX-Seiten zu verwenden, muss die MDX-Unterstützung installieren und konfiguriert werden, indem die Astro-Integration von [@astrojs/mdx](https://docs.astro.build/en/guides/integrations-guide/mdx/) befolgt wird. Die `astro.config.mjs` sollte nun die Integration von `@astrojs/mdx` enthalten.

> Hinweis: Shiki ist der Standard-Syntax-Highlighter für das MDX-Plugin und wird derzeit nicht unterstützt. `astro-angular` wird dies mit `prism` überschreiben, aber es sollte in der Konfiguration angeben werden, um Warnungen oder Probleme zu vermeiden.

```js
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [mdx({ syntaxHighlight: 'prism' }), angular()],
});
```

Erstelle eine `.mdx`-Datei im Verzeichnis `src/pages` und füge den Import der Angular-Komponente unter Frontmatter hinzu.

```md
---
layout: '../../layouts/BlogPost.astro'
title: 'Using Angular in MDX'
description: 'Lorem ipsum dolor sit amet'
pubDate: 'Sep 22 2022'
---

import { HelloComponent } from "../../components/hello.component.ts";

<HelloComponent />
<HelloComponent helpText="Helping" />
```

Um die Komponente auf dem Client zu hydrieren, verwende eine der Astro-[Client-Direktiven](https://docs.astro.build/en/reference/directives-reference/#client-directives):

```md
---
layout: '../../layouts/BlogPost.astro'
title: 'Using Angular in MDX'
description: 'Lorem ipsum dolor sit amet'
pubDate: 'Sep 22 2022'
---

import { HelloComponent } from "../../components/hello.component.ts";

<HelloComponent client:load />
<HelloComponent client:visible helpText="Helping" />
```

> Wichtig: In `.mdx`-Dateien muss der Komponentenimport mit dem Suffix `.ts` enden. Andernfalls schlägt der dynamische Import der Komponente fehl und die Komponente kann nicht hydriert werden.

## Aktuelle Einschränkungen

- Es werden nur standalone Angular-Komponenten der Version v14.2+ unterstützt
