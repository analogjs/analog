---
title: 'Verwendung von CSS-Präprozessoren'
---

Das Vite Plugin unterstützt die CSS-Vorverarbeitung mit externen `styleUrls` und Inline `styles` in den Metadaten des Komponentendekorators.

Externe `styleUrls` können ohne zusätzliche Konfiguration verwendet werden.

Ein Beispiel mit `styleUrls`:

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {}
```

Um die Vorverarbeitung von Inline-`styles` zu unterstützen, muss das Plugin so konfiguriert werden, dass es die Erweiterung des Typs der verwendeten Styles bereitstellt.

Ein Beispiel für die Verwendung von `scss` mit inline `styles`:

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  templateUrl: './app.component.html',
  styles: [
    `
      $neon: #cf0;

      @mixin background($color: #fff) {
        background: $color;
      }

      h2 {
        @include background($neon);
      }
    `,
  ],
})
export class AppComponent {}
```

Stelle in der Datei `vite.config.ts` der Plugin-Funktion `angular` ein Objekt zur Verfügung, dessen Eigenschaft `inlineStylesExtension` auf die Dateierweiterung für die CSS-Vorverarbeitung gesetzt ist.

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    // ... other config
    plugins: [
      angular({
        inlineStylesExtension: 'scss',
      }),
    ],
  };
});
```

Unterstützte CSS-Präprozessor-Erweiterungen sind `scss`, `sass` und `less`. Weitere Informationen über CSS-Präprozessoren finden Sie in der [Vite Dokumentation](https://vitejs.dev/guide/features.html#css-pre-processors).
