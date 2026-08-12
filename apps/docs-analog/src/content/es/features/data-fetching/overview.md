# Visión General

La obtención de datos en Analog se basa en conceptos de Angular, como el uso de `HttpClient` para realizar solicitudes API.

## Uso de HttpClient

Usar `HttpClient` es la forma recomendada para hacer solicitudes API a endpoints internos y externos. El contexto para la solicitud es proporcionado por la función `provideServerContext` para cualquier solicitud que use `HttpClient` y comience con una `/`.

## Contexto de Solicitud del Servidor

En el servidor, usa la función `provideServerContext` del router de Analog en el `main.server.ts`.

```ts
// Contexto del servidor de Analog
if (import.meta.env.PROD) {
  enableProdMode();
}

export function bootstrap() {
  return bootstrapApplication(AppComponent, config);
}

export default async function render(
  url: string,
  document: string,
  serverContext: ServerContext,
) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });

  return html;
}
```

Esto proporciona el `Request` y `Response`, y la `Base URL` desde el servidor y los registra como proveedores que pueden ser inyectados y usados.

## Funciones de Inyección

```ts
class MyService {
  request = injectRequest(); // <- Objeto de Solicitud del Servidor
  response = injectResponse(); // <- Objeto de Respuesta del Servidor
  baseUrl = injectBaseURL(); // <-- Base URL del Servidor
}
```

## Interceptor de Contexto de Solicitud

Analog también provee `requestContextInterceptor` para el `HttpClient` que maneja la transformación de cualquier solicitud a una URL que comience con una `/` a una solicitud de URL completa en el servidor, cliente y durante el prerenderizado.

Úsalo con la función `withInterceptors` del paquete `@angular/common/http`.

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withNavigationErrorHandler(console.error)),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideClientHydration(),
  ],
};
```

> Asegúrate de que el `requestContextInterceptor` esté **último** en el arreglo de interceptores.

## Realizando Solicitudes

En tu componente/servicio, usa `HttpClient` junto con [API routes](/docs/features/api/overview) proporcionando una URL completa.

Un ejemplo de ruta API que obtiene todos los todos.

```ts
// src/server/routes/api/v1/todos.ts -> /api/v1/todos
export default eventHandler(async () => {
  const response = await fetch('https://jsonplaceholder.typicode.com/todos');
  const todos = await response.json();

  return todos;
});
```

Un ejemplo de servicio que obtiene todos los todos desde el endpoint API.

```ts
// todos.service.ts
@Injectable({
  providedIn: 'root',
})
export class TodosService {
  http = inject(HttpClient);

  getAll() {
    return this.http.get<Todo[]>('/api/v1/todos');
  }

  getData() {
    return this.http.get<Todo[]>('/assets/data.json');
  }
}
```

Las solicitudes de datos también usan el `TransferState` de Angular para almacenar cualquier solicitud realizada durante la Renderización del Lado del Servidor, y se transfieren para prevenir una solicitud adicional durante la hidratación inicial del lado del cliente.
