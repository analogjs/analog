---
title: 'Usando Preprocesadores de CSS'
---

El Plugin de Vite soporta el preprocesamiento de CSS utilizando `styleUrls` externas y `styles` en línea en los metadatos del decorador del Componente.

Las `styleUrls` externas pueden ser usadas sin ninguna configuración adicional.

Un ejemplo con `styleUrls`:

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {}
```

Para soportar el preprocesamiento de `styles` en línea, el plugin debe ser configurado para proporcionar la extensión del tipo de estilos que se están usando.

Un ejemplo de uso de `scss` con `styles` en línea:

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

En el `vite.config.ts`, proporciona un objeto a la función del plugin `angular` con la propiedad `inlineStylesExtension` establecida a la extensión del archivo del preprocesador de CSS que se está usando.

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    // ... otra configuración
    plugins: [
      angular({
        inlineStylesExtension: 'scss',
      }),
    ],
  };
});
```

Las extensiones de preprocesador de CSS soportadas incluyen `scss`, `sass` y `less`. Más información sobre el preprocesamiento de CSS puede encontrarse en la [Documentación de Vite](https://vitejs.dev/guide/features.html#css-pre-processors).
