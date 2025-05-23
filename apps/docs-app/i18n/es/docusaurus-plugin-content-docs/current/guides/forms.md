# Acciones del Servidor para Formularios

Analog admite el manejo en el lado del servidor de los envíos y la validación de formularios.

<div className="video-container">
  <div className="video-responsive-wrapper">
    <iframe
      width="560"
      height="315"
      src="https://www.youtube.com/embed/4pFPO1OpD4Q?si=HcESaJI03LgEljpQ&amp;controls=0">
    </iframe>
  </div>
</div>

## Configuración del Formulario

Para manejar los envíos de formularios, usa la directiva `FormAction` del paquete `@analogjs/router`. Esta directiva se encarga de recolectar los `FormData` (Datos del Formulario) y enviar una solicitud `POST` al servidor.

La directiva emite eventos después de procesar el formulario:

- `onSuccess`: cuando el formulario se está procesando en el servidor y devuelve una respuesta de éxito.
- `onError`: cuando el formulario devuelve una respuesta de error.
- `onStateChange`: cuando se envía el formulario.

La página de ejemplo a continuación envía un correo electrónico para el registro a un boletín informativo (newsletter signup)

```ts
// src/app/pages/newsletter.page.ts
import { Component, signal } from '@angular/core';

import { FormAction } from '@analogjs/router';

type FormErrors =
  | {
      email?: string;
    }
  | undefined;

@Component({
  selector: 'app-newsletter-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <h3>Newsletter Signup</h3>

    @if (!signedUp()) {
      <form
        method="post"
        (onSuccess)="onSuccess()"
        (onError)="onError($any($event))"
        (onStateChange)="errors.set(undefined)"
      >
        <div>
          <label for="email"> Email </label>
          <input type="email" name="email" />
        </div>

        <button class="button" type="submit">Submit</button>
      </form>

      @if (errors()?.email) {
        <p>{{ errors()?.email }}</p>
      }
    } @else {
      <div>Thanks for signing up!</div>
    }
  `,
})
export default class NewsletterComponent {
  signedUp = signal(false);
  errors = signal<FormErrors>(undefined);

  onSuccess() {
    this.signedUp.set(true);
  }

  onError(result?: FormErrors) {
    this.errors.set(result);
  }
}
```

La directiva `FormAction` envía los datos del formulario al servidor, los cuales son procesados por su manejador (handler).

## Manejo de la Acción del Formulario

Para manejar la acción del formulario, define el archivo `.server.ts` junto con el archivo `.page.ts` que contiene la función asíncrona `action` para procesar el envío del formulario.

En la acción del servidor, puedes acceder a variables de entorno (environment variables), leer cookies y realizar otras operaciones exclusivas del lado del servidor.

```ts
// src/app/pages/newsletter.server.ts
import {
  type PageServerAction,
  redirect,
  json,
  fail,
} from '@analogjs/router/server/actions';
import { readFormData } from 'h3';

export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
  const email = body.get('email') as string;

  if (!email) {
    return fail(422, { email: 'Email is required' });
  }

  if (email.length < 10) {
    return redirect('/');
  }

  return json({ type: 'success' });
}
```

- La función `json` devuelve una respuesta JSON (Notación de Objetos de JavaScript).
- La función `redirect` (redireccionar) devuelve una respuesta de redireccionamiento al cliente. Esta debe ser una ruta absoluta.
- La función `fail` (fallar) se usa para devolver errores de validación del formulario.

### Manejo de Múltiples Formularios

Para manejar múltiples formularios en la misma página, agrega un campo de entrada oculto (hidden input) para distinguir cada formulario.

```html
<form method="post">
  <div>
    <label for="email"> Email </label>
    <input type="email" name="email" />
  </div>

  <input type="hidden" name="action" value="register" />

  <button class="button" type="submit">Submit</button>
</form>
```

En la acción del servidor, usa el valor `action`.

```ts
export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
  const action = body.get('action') as string;

  if (action === 'register') {
    // process register form
  }
}
```

## Manejo de Solicitudes GET

Los formularios con una acción `GET` pueden usarse para navegar a la misma URL (Localizador Uniforme de Recursos), con las entradas del formulario pasadas como parámetros de consulta (query parameters).

El ejemplo a continuación define un formulario de búsqueda con el campo `search` (búsqueda)

```ts
// src/app/pages/search.page.ts
import { Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad, FormAction } from '@analogjs/router';

import type { load } from './search.server';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <h3>Search</h3>

    <form method="get">
      <div>
        <label for="search"> Search </label>
        <input type="text" name="search" [value]="searchTerm()" />
      </div>

      <button class="button" type="submit">Submit</button>
    </form>

    @if (searchTerm()) {
      <p>Search Term: {{ searchTerm() }}</p>
    }
  `,
})
export default class NewsletterComponent {
  loader = toSignal(injectLoad<typeof load>(), { requireSync: true });
  searchTerm = computed(() => this.loader().searchTerm);
}
```

El parámetro de consulta puede ser accedido a través de la acción del formulario del servidor.

```ts
// src/app/pages/search.server.ts
import type { PageServerLoad } from '@analogjs/router';
import { getQuery } from 'h3';

export async function load({ event }: PageServerLoad) {
  const query = getQuery(event);
  console.log('loaded search', query['search']);

  return {
    loaded: true,
    searchTerm: `${query['search']}`,
  };
}
```
