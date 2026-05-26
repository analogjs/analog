# Serverseitiges Rendering (SSR)

Analog unterstützt das serverseitige Rendering während der Entwicklung und der Erstellung für die Produktion.

## Pakete für SSR-Kompatibilität umwandeln

Einige Abhängigkeiten benötigen möglicherweise zusätzliche Transformationen, um für das serverseitige Rendering zu funktionieren. Wenn während der Entwicklung von SSR eine Fehler auftritt, besteht eine Möglichkeit darin, das/die Paket(e) zum Array `ssr.noExternal` in der Vite-Konfiguration hinzuzufügen.

Es können glob-Muster verwendet werden, um Gruppen von Paketen oder Bibliotheken einzuschließen. Einige Beispiele sind unten aufgeführt.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: [
      'apollo-angular', // npm package import
      'apollo-angular/**', // npm package import along with sub-packages
      '@spartan-ng/**', // libs under the npmScope inside an Nx workspace
    ],
  },
  // ...other config
}));
```

Weitere Informationen über Externals mit SSR sind in der [Vite-Dokumentation] (https://vitejs.dev/guide/ssr.html#ssr-externals) zu finden.

## SSR deaktivieren

SSR is enabled by default. You can opt-out of it and generate a client-only build by adding the following option to the `analog()` plugin in your `vite.config.ts`:
SSR ist standardmäßig aktiviert. Du kannst dich dagegen entscheiden und einen reinen Client-Build erzeugen, indem die folgende Option zum `analog()`-Plugin in Ihrer `vite.config.ts` hinzugefügt wird:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [analog({ ssr: false })],
}));
```

## Vorberechnung von Routen

Mit SSR wird die `"/"`-Route standardmäßig vorberechnet.

Es ist ein notwendiger Schritt, um ein gerendertes HTML zurückzugeben, wenn der Benutzer das Stammverzeichnis der Anwendung besucht. Die vorberechneten Routen können angepasst werden, aber denke daran, auch die `"/"`-Route einzubeziehen.

```js
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about'],
      },
    }),
  ],
}));
```

Die Vorberechnung kann deaktivieren werden, indem ein leerer Array von Routen übergeben wird.
