---
sidebar_position: 1
---

# Analog SFCs (Componentes de un solo archivo)

> **Nota:**
>
> Este formato de archivos y su API es experimental, es una iniciativa impulsada por la comunidad, y no es un cambio oficialmente propuesto para Angular. Úselo bajo su propio riesgo.

La extensión de archivo .analog denota un nuevo formato de archivo para Componentes de Archivo Único (SFCs) que tiene como objetivo simplificar la experiencia de autoría y proporcionar componentes y directivas compatibles con Angular.

Juntos, combina:

- Etiquetas de plantilla, script y estilo co-localizadas
- Uso de APIs de Señales de Angular sin decoradores
- Predeterminados orientados al rendimiento (`OnPush` detección de cambios, sin acceso a `ngDoCheck`, etc.)

## Uso

Para usar el SFC análogo, necesita usar el plugin de Analog Vite o el [plugin de Analog Astro](/docs/packages/astro-angular/overview) con una bandera adicional para habilitar su uso:

```typescript
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  // ...
  plugins: [
    analog({
      vite: {
        // Required to use the Analog SFC format
        experimental: {
          supportAnalogFormat: true,
        },
      },
    }),
  ],
});
```

> También debes descomentar la información de tipos en el archivo src/vite-env.d.ts. Esto es temporal mientras el SFC Analog es experimental.

### Configuración adicional

Si está utilizando archivos `.analog` fuera de la raíz del proyecto, necesita especificar todas las rutas de los archivos `.analog` usando globs, de la siguiente manera:

```typescript
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [
    analog({
      vite: {
        experimental: {
          supportAnalogFormat: {
            include: ['/libs/shared/ui/**/*', '/libs/some-lib/ui/**/*'],
          },
        },
      },
    }),
  ],
}));
```

### Soporte para IDE

Para soportar el resaltado de sintaxis y otras funcionalidades del IDE con archivos `.analog`, necesitas instalar una extensión para soportar el formato para:

- [VSCode](https://marketplace.visualstudio.com/items?itemName=AnalogJS.vscode-analog)

- [WebStorm 2024.1+ o IDEA Ultimate 2024.1+ (EAP)](https://github.com/analogjs/idea-plugin)

## Implementando un SFC

Aquí hay una demostración del formato Analog construyendo un contador simple

```html
<script lang="ts">
  // counter.analog
  import { signal } from '@angular/core';

  const count = signal(0);

  function add() {
    count.set(count() + 1);
  }
</script>

<template>
  <div class="container">
    <button (click)="add()">{{count()}}</button>
  </div>
</template>

<style>
  .container {
    display: flex;
    justify-content: center;
  }

  button {
    font-size: 2rem;
    padding: 1rem 2rem;
    border-radius: 0.5rem;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
  }
</style>
```

Consulte la sección [defineMetadata](#metadata) para agregar metadatos adicionales al componente.

## Metadatos

Mientras que los decoradores de clase se utilizan para agregar metadatos a un componente o directiva en los métodos de autoría tradicionales de Angular, estos se reemplazan en el formato Analog con la función global `defineMetadata`:

```typescript
defineMetadata({
  host: { class: 'block articles-toggle' },
});
```

Esto soporta todas las propiedades de decorador de `@Component` o `@Directive` con algunas excepciones.

### Propiedades de Metadatos Prohibidas

Las siguientes propiedades no están permitidas en los campos de metadatos:

- `template`: Utilice el `<template>` de SFC o `defineMetadata.templateUrl` en su lugar
- `standalone`: Siempre establecido en `true`
- `changeDetection`: Siempre establecido en `OnPush`
- `styles`: Utiliza la etiqueta `<style>` de SFC
- `outputs`: Utiliza la API de señal `output` en su lugar
- `inputs`: Utiliza la API de señal `input` en su lugar

### Metadatos del Host

Como se muestra arriba, puede agregar metadatos del host a su componente utilizando el campo `host`:

```typescript
defineMetadata({
  host: { class: 'block articles-toggle' },
});
```

Otra forma de agregar metadatos de `host` es usar la etiqueta `<template>`

```analog
<template class="block articles-toggle"></template>
```

También puede tener **Vinculación de Propiedades** y **Vinculación de Eventos** en la etiqueta `<template>`:

```analog
<script lang="ts">
  import { signal } from '@angular/core';

  const bg = signal('black');

  function handleClick() {
  }
</script>

<template [style.backgroundColor]="bg()" (click)="handleClick()"></template>
```

### Uso de una Plantilla y Estilos Externos

Si te gusta la experiencia de desarrollador del `<script>` de Analog para construir su lógica, pero no quieres la plantilla y los estilos en el mismo archivo, puedes separarlos a sus propios archivos usando:

- `templateUrl`
- `styleUrl`
- `styleUrls`

En `defineMetadata`, de la siguiente manera:

```html
<script lang="ts">
  defineMetadata({
    selector: 'app-root',
    templateUrl: './test.html',
    styleUrl: './test.css',
  });

  onInit(() => {
    alert('Hello World');
  });
</script>
```

## Uso de Componentes

Al usar el formato Analog, no necesitas exportar explícitamente nada; el componente es la exportación predeterminada del archivo `.analog`:

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import App from './app/app.analog';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
```

Para usar los componentes necesitas agregarlos al arreglo `imports` (alternativamente, puedes usar **atributos de importación** como se explica en la siguiente sección):

```html
<!-- layout.analog -->
<script lang="ts">
  import { inject } from '@angular/core';
  import { RouterOutlet } from '@angular/router';
  import { AuthStore } from '../shared-data-access-auth/auth.store';
  import LayoutFooter from '../ui-layout/layout-footer.analog';
  import LayoutHeader from '../ui-layout/layout-header.analog';

  defineMetadata({ imports: [RouterOutlet, LayoutFooter, LayoutHeader] });

  const authStore = inject(AuthStore);
</script>

<template>
  <LayoutHeader
    [isAuthenticated]="authStore.isAuthenticated()"
    [username]="authStore.username()"
  />
  <router-outlet />
  <LayoutFooter />
</template>
```

> El `selector` de un componente no está determinado por el nombre importado, sino por el nombre del archivo. Si cambia su nombre importado a:
>
> ```html
> <script lang="ts">
>   import LayoutHeaderHeading from '../ui-layout/layout-header.analog';
> </script>
>
> <template>
>   <LayoutHeaderHeading />
> </template>
> ```
>
> No funcionaría como se espera. Para resolver esto, necesitará que el nombre de la importación predeterminada coincida con el nombre del archivo `.analog`.
>
> Una solución oficial para este problema, de Angular, ha sido insinuada por el equipo de Angular y puede llegar en una versión futura de Angular.

### Atributos de Importación

Para evitar la necesidad de agregar manualmente componentes a los metadatos de `imports`, también puede usar [atributos de importación](https://github.com/tc39/proposal-import-attributes)

```html
<script lang="ts">
  import YourComponent from './your-component.analog' with { analog: 'imports' };
</script>
```

Usar el método de atributos de importación agrega el componente a los metadatos de `imports` de su componente y puede ser utilizado para otras importaciones que desee agregar a los metadatos, ejemplo:

```html
<script lang="ts">
  // Esto agrega el archivo al arreglo `providers` en tus metadatos
  import { MyService } from './my.service' with { analog: 'providers' };
  // Esto agrega un campo `ExternalEnum` al constructor de tu componente para que puedas usarlo en la plantilla
  import { ExternalEnum } from './external.model' with { analog: 'exposes' };
  // ...
</script>
```

### Métodos de Ciclo de Vida

Actualmente, solo dos métodos de ciclo de vida de Angular están disponibles para los SFCs `.analog`:

- `onInit`
- `onDestroy`

Se utilizan estos métodos de ciclo de vida de la siguiente manera:

```html
<!-- app.analog -->
<script lang="ts">
  onInit(() => {
    console.log('I am mounting');
  });

  onDestroy(() => {
    console.log('I am unmounting');
  });
</script>
```

Esto fomenta las mejores prácticas al usar señales de Angular ya que muchos de los otros métodos de ciclo de vida pueden introducir problemas de rendimiento o son fácilmente reemplazados por otras APIs.

## Inputs y Outputs

Para agregar Inputs y Outputs, usas la nueva API de señales de Angular.

Vamos a explorar cómo se ve esto en términos prácticos.

### Inputs

Los Inputs se pueden agregar a un componente o directiva usando [la nueva API de señal `input`](https://angular.io/guide/signal-inputs):

```typescript
const namedInput = input();
```

Esto agrega un input con el nombre de `namedInput` que se puede usar en la plantilla de la siguiente manera:

```html
<template>
  <SomeComponent [namedInput]="someValue" />
</template>
```

### Outputs

Los outputs se agregan de la siguiente manera:

```html
<script lang="ts">
  // my-item.analog
  const itemSelected = output();

  function selectItem(id: number) {
    itemSelected.emit(id);
  }
</script>
```

Y estos pueden ser usados en la plantilla de la siguiente forma:

```html
<template>
  <h2>My Item</h2>

  <button (click)="selectItem(1)">Select</button>
</template>
```

El output es consumido por fuera del componente

```html
<script lang="ts">
  function doSomething(id: number) {
    console.log('Item seleccionado' + id);
  }
</script>

<template>
  <MyItem (itemSelected)="doSomething($event)" />
</template>
```

### Models

Los atributos del tipo `Models` son agregados de la siguiente forma:

```html
<script lang="ts">
  // some-component.analog
  const myValue = model();
</script>
```

Y pueden ser usados en la platilla de la siguiente forma:

```html
<template>
  <SomeComponent [myValue]="val" (myValueChange)="doSomething($event)" />
</template>
```

## Autoría de Directivas

Cualquier archivo `.analog` sin una etiqueta `<template>` o uso de `templateUrl` en la función `defineMetadata` se trata como Directivas Angular.

Aquí hay un ejemplo de una directiva que enfoca una entrada (Input) y tiene dos métodos de ciclo de vida:

```html
<script lang="ts">
  import { inject, ElementRef, afterNextRender, effect } from '@angular/core';

  defineMetadata({
    selector: 'input[directive]',
  });

  const elRef = inject(ElementRef);

  afterNextRender(() => {
    elRef.nativeElement.focus();
  });

  onInit(() => {
    console.log('init code');
  });

  effect(() => {
    console.log('just some effect');
  });
</script>
```

## Autoría de SFCs usando Markdown

Si prefieres escribir Markdown como tu plantilla en lugar de HTML mejorado por Angular, puedes agregar `lang="md"` a tu etiqueta `<template>` en un archivo `.analog`:

```html
<template lang="md"> # Hello World </template>
```

Esto puede ser usado en combinación con las otras etiquetas del SFC: `<script>` y `<style>`.

### Uso de Componentes en Markdown

Las plantillas `lang="md"` en Analog también admiten componentes de Analog y Angular en sus plantillas:

```html
<script lang="ts">
  import Hello from './hello.analog' with { analog: 'imports' };
</script>

<template lang="md">
  # Saludos

  <Hello />

  > Posiblemente querras decir hola! de vuelta
</template>
```

## Uso de SFCs como Archivos de Contenido Interactivo

También puedes crear archivos de contenido con frontmatter dentro de la carpeta `src/content` utilizando la extensión `.agx` en lugar de `.analog`. Esto proporciona una experiencia similar a MDX para la autoría de contenido:

```html
---
title: Hello World
slug: 'hello'
---

<script lang="ts">
  // src/content/post.agx
  const name = 'Analog';
</script>

<template lang="md"> My First Post on {{ name }} </template>
```

Al igual que con los archivos `.md`, puedes buscar y filtrar dinámicamente archivos de contenido `.agx` usando [injectContentFiles](https://analogjs.org/docs/features/routing/content#using-the-content-files-list) y puedes renderizar contenido dentro de un componente usando [injectContent](https://analogjs.org/docs/features/routing/content#using-the-analog-markdown-component) y el `MarkdownComponent`:

```html
<script lang="ts">
  // posts.[slug].page.analog
  import { injectContent } from '@analogjs/content';
  import { MarkdownComponent } from '@analogjs/content' with { analog: 'imports' }
  import { toSignal } from '@angular/core/rxjs-interop';

  import { PostAttributes } from './models';

  // inyecta el contenido basado en el slug
  const post$ = injectContent<PostAttributes>();
  const post = toSignal(post$);
</script>

<template>
  @if(post()){
  <analog-markdown [content]="post().content"></analog-markdown>
  }
</template>
```

## Limitaciones

Hay algunas limitaciones en el formato Análogo:

- No puedes usar APIs de decoradores (`@Input`, `@Component`, `@ViewChild`)
- Debes tener `lang="ts"` presente en la etiqueta `<script>`
