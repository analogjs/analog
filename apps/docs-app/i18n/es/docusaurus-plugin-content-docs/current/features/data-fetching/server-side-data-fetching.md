# Obtención de datos en el lado del servidor

Analog admite la obtención de datos del servidor antes de cargar una página. Esto se puede lograr definiendo una función `load` asíncrona en el archivo `.server.ts` de la página.

## Configuración de la URL base pública

Analog requiere que la URL base pública se establezca al usar la obtención de datos del lado del servidor. Establezca una variable de entorno, usando un archivo `.env` para definir la URL base pública.

```
// .env
VITE_ANALOG_PUBLIC_BASE_URL="http://localhost:5173"
```

La variable de entorno también debe establecerse al compilar para implementación.

## Obtención de datos

Para obtener los datos del servidor, cree un archivo `.server.ts` que contenga la función `load` asíncrona junto con el archivo `.page.ts`.

```ts
// src/app/pages/index.server.ts
import { PageServerLoad } from '@analogjs/router';

export const load = async ({
  params, // params/queryParams de la ruta
  req, // Solicitud H3
  res, // Manejador de la respuesta de H3
  fetch, // fetch interno para llamadas API directas
  event, // evento de solicitud completo
}: PageServerLoad) => {
  return {
    loaded: true,
  };
};
```

## Inyectar los datos

El acceso a los datos obtenidos en el servidor se puede hacer usando la función `injectLoad` proporcionada por `@analogjs/router`.

```ts
// src/app/pages/index.page.ts
import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { LoadResult, injectLoad } from '@analogjs/router';

import { load } from './index.server'; // no incluido en el build del cliente

@Component({
  standalone: true,
  template: `
    <h2>Home</h2>

    Loaded: {{ data().loaded }}
  `,
})
export default class BlogComponent {
  data = toSignal(injectLoad<typeof load>(), { requireSync: true });
}
```

Accessing the data can also be done with Component Inputs and Component Input Bindings provided in the Angular Router configuration. To configure the Angular Router for `Component Input Bindings`, add `withComponentInputBinding()` to the arguments passed to `provideFileRouter()` in the `app.config.ts`.

```ts
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { withNavigationErrorHandler } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withComponentInputBinding(),
      withNavigationErrorHandler(console.error)
    ),
    provideHttpClient(),
    provideClientHydration(),
  ],
};
```

Ahora, para obtener los datos en el componente, agregue una entrada llamada `load`.

```ts
// src/app/pages/index.page.ts
import { Component } from '@angular/core';
import { LoadResult, injectLoad } from '@analogjs/router';

import { load } from './index.server'; // no incluido en el build del cliente

@Component({
  standalone: true,
  template: `
    <h2>Home</h2>
    Loaded: {{ data.loaded }}
  `,
})
export default class BlogComponent {
  @Input() load(data: LoadResult<typeof load>) {
    this.data = data;
  }

  data!: LoadResult<typeof load>;
}
```
