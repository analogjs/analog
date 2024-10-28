# Obtención de Datos del Lado del Servidor

Analog soporta la obtención de datos desde el servidor antes de cargar una página. Esto se puede lograr definiendo una función `load` asíncrona en el archivo `.server.ts` de la página.

## Obtención de los Datos

Para obtener los datos desde el servidor, crea un archivo `.server.ts` que contenga la función asíncrona `load` junto al archivo `.page.ts`.

```ts
// src/app/pages/index.server.ts
import { PageServerLoad } from '@analogjs/router';

export const load = async ({
  params, // params/queryParams de la solicitud
  req, // Solicitud H3
  res, // Manejador de Respuesta H3
  fetch, // fetch interno para llamadas API directas,
  event, // evento de solicitud completo
}: PageServerLoad) => {
  return {
    loaded: true,
  };
};
```

## Inyección de los Datos

Acceder a los datos obtenidos en el servidor se puede hacer utilizando la función `injectLoad` proporcionada por `@analogjs/router`.  
La función `load` se resuelve utilizando resolutores de rutas de Angular, por lo que establecer `requireSync: false` y `initialValue: {}` no ofrece ninguna ventaja, ya que `load` se obtiene antes de que el componente sea instanciado.

```ts
// src/app/pages/index.page.ts
import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad } from '@analogjs/router';

import { load } from './index.server'; // no incluido en la compilación del cliente

@Component({
  standalone: true,
  template: `
    <h2>Inicio</h2>

    Loaded: {{ data().loaded }}
  `,
})
export default class BlogComponent {
  data = toSignal(injectLoad<typeof load>(), { requireSync: true });
}
```

Acceder a los datos también se puede hacer con Entradas de Componentes y Enlaces de Entradas de Componentes proporcionados en la configuración del Router de Angular. Para configurar el Router de Angular para `Component Input Bindings`, agrega `withComponentInputBinding()` a los argumentos pasados a `provideFileRouter()` en el `app.config.ts`.

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

Ahora, para obtener los datos en el componente, agrega una entrada llamada `load`.

```ts
// src/app/pages/index.page.ts
import { Component, Input } from '@angular/core';
import { LoadResult } from '@analogjs/router';

import { load } from './index.server'; // no incluido en la compilación del cliente

@Component({
  standalone: true,
  template: `
    <h2>Inicio</h2>
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

## Acceso a los Datos de Carga del Servidor

Acceder a los datos de carga del servidor desde el resolutor `RouteMeta` se puede hacer utilizando la función `getLoadResolver` proporcionada por `@analogjs/router`.

```ts
import { getLoadResolver } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  resolve: {
    data: async (route) => {
      // llamar al resolutor de carga del servidor para esta ruta desde otro resolutor
      const data = await getLoadResolver(route);

      return { ...data };
    },
  },
};
```

## Sobrescribir la URL Base Pública

Analog infiere automáticamente la URL base pública que se debe establecer al usar la obtención de datos del lado del servidor a través de su [Contexto de Solicitud del Servidor](/docs/features/data-fetching/overview#server-request-context) y [Interceptor de Contexto de Solicitud](/docs/features/data-fetching/overview#request-context-interceptor). Para establecer explícitamente la URL base, configura una variable de entorno utilizando un archivo `.env` para definir la URL base pública.

```
# .env
VITE_ANALOG_PUBLIC_BASE_URL="http://localhost:5173"
```

La variable de entorno también debe estar configurada al construir para despliegue.
