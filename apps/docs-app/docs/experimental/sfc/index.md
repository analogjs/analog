---
sidebar_position: 1
---

# Analog SFCs

> **Note:**
>
> This file format and API is experimental, is a community-driven initiative, and is not an officially proposed change to Angular. Use it at your own risk.

The `.analog` file extension denotes a new file format for Single File Components (SFCs) that aims to simplify the authoring experience and provide Angular-compatible components and directives.

Together, it combines:

- Colocated template, script, and style tags
- Use of Angular Signal APIs without decorators
- Performance-first defaults (`OnPush` change detection, no accesss to `ngDoCheck`, etc.)

## Usage

To use the Analog SFC, you need to use the Analog Vite plugin or the [Analog Astro plugin](/docs/packages/astro-angular/overview) with an additional flag to enable its usage:

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

> You must also uncomment the type information in the `src/vite-env.d.ts` file. This is temporary while the Analog SFC is experimental.

### Additional Configuration

If you are using `.analog` files outside a project's root you need to specify all paths of `.analog` files using globs, like so:

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

### IDE Support

To support syntax highlighting and other IDE functionality with `.analog` files, you need to install an extension to support the format for:

- [VSCode](https://marketplace.visualstudio.com/items?itemName=AnalogJS.vscode-analog).

- [WebStorm 2024.1+ or IDEA Ultimate 2024.1+ (EAP)](https://github.com/analogjs/idea-plugin)

## Authoring an SFC

Here's a demonstration of the Analog format building a simple counter:

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

See the [defineMetadata](#metadata) section for adding additional component metadata.

## Metadata

While class decorators are used to add metadata to a component or directive in the traditional Angular authoring methods, they're replaced in the Analog format with the `defineMetadata` global function:

```typescript
defineMetadata({
  host: { class: 'block articles-toggle' },
});
```

This supports all of the decorator properties of `@Component` or `@Directive` with a few exceptions.

### Disallowed Metadata Properties

The following properties are not allowed on the metadata fields:

- `template`: Use the SFC `<template>` or `defineMetadata.templateUrl` instead
- `standalone`: Always set to `true`
- `changeDetection`: Always set to `OnPush`
- `styles`: Use the SFC `<style>` tag
- `outputs`: Use the `output` signal API instead
- `inputs`: Use the `input` signal API instead

### Host Metadata

As shown above, you can add host metadata to your component using the `host` field:

```typescript
defineMetadata({
  host: { class: 'block articles-toggle' },
});
```

Another way to add host metadata is to use the `<template>` tag

```html
<template class="block articles-toggle"></template>
```

You can also have **Property Binding** and **Event Binding** in the `<template>` tag:

```html
<script lang="ts">
  import { signal } from '@angular/core';

  const bg = signal('black');

  function handleClick() {}
</script>

<template [style.backgroundColor]="bg()" (click)="handleClick()"></template>
```

### Using an External Template and Styles

If you like the developer experience of Analog's `<script>` to build your logic, but don't want your template and styling in the same file, you can break those out to their own files using:

- `templateUrl`
- `styleUrl`
- `styleUrls`

In `defineMetadata`, like so:

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

## Using Components

When using the Analog format, you do not need to explicitly export anything; the component is the default export of the `.analog` file:

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import App from './app/app.analog';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
```

To use the components you need to add them to your `imports` (alternatively, you can use **import attributes** as explained in the following section):

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

> A component's `selector` is not determined by the imported name, but rather determined by the name of the file. If you change your imported name to:
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
> It would not work as expected. To solve this, you'll need the name of the default import to match the file name of the `.analog` file.
>
> An official solution for this problem, from Angular, has been hinted by the Angular team and may come in a future version of Angular.

### Import Attributes

To avoid the necessity of manually adding components to the `imports` metadata, you can also use [import attributes](https://github.com/tc39/proposal-import-attributes)

```html
<script lang="ts">
  import YourComponent from './your-component.analog' with { analog: 'imports' };
</script>
```

Using the import attribute method adds the component to your metadata's `imports` and can be used for other imports you want to add to the metadata, like so:

```html
<script lang="ts">
  // This adds to the `providers` array in your metadata
  import { MyService } from './my.service' with { analog: 'providers' };
  // This adds the `ExternalEnum` field to your component's constructor so that you can use it in your template
  import { ExternalEnum } from './external.model' with { analog: 'exposes' };
  // ...
</script>
```

### Lifecycle Methods

Currently, only two lifecycle methods from Angular are available to `.analog` SFCs:

- `onInit`
- `onDestroy`

You use these lifecycle methods like so:

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

This encourages best practices when using Angular signals since many of the other lifecycle methods can introduce performance issues or are easily replaced with other APIs.

## Inputs and Outputs

To add inputs and outputs to an Analog component, you use the new Angular signals API.

Let's explore what that looks like in practical terms.

### Inputs

Inputs can be added to a component or directive in the Analog format using [the new `input` signal API](https://angular.io/guide/signal-inputs):

```typescript
const namedInput = input();
```

This adds an input with the name of `namedInput` that can be used in the template like so:

```html
<template>
  <SomeComponent [namedInput]="someValue" />
</template>
```

### Outputs

Outputs are added in the Analog format like so:

```html
<script lang="ts">
  // my-item.analog
  const itemSelected = output();

  function selectItem(id: number) {
    itemSelected.emit(id);
  }
</script>
```

And can be used in the template like so:

```html
<template>
  <h2>My Item</h2>

  <button (click)="selectItem(1)">Select</button>
</template>
```

The output is consumed outside the component

```html
<script lang="ts">
  function doSomething(id: number) {
    console.log('Item Selected' + id);
  }
</script>

<template>
  <MyItem (itemSelected)="doSomething($event)" />
</template>
```

### Models

Models are added in the Analog format like so:

```html
<script lang="ts">
  // some-component.analog
  const myValue = model();
</script>
```

And can be used in the template like so:

```html
<template>
  <SomeComponent [myValue]="val" (myValueChange)="doSomething($event)" />
</template>
```

## Authoring Directives

Any `.analog` file without a `<template>` tag or usage of `templateUrl` in the `defineMetadata` function are treated as Angular Directives.

Here's an example of a directive that focuses an input and has two lifecycle methods:

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

## Authoring SFCs using Markdown

If you'd like to write Markdown as your template rather than Angular-enhanced HTML, you can add `lang="md"` to your `<template>` tag in an `.analog` file:

```html
<template lang="md"> # Hello World </template>
```

This can be used in combination with the other SFC tags: `<script>` and `<style>`.

### Using Components in Markdown

`lang="md"` templates in Analog also support Analog and Angular components in their templates:

```html
<script lang="ts">
  import Hello from './hello.analog' with { analog: 'imports' };
</script>

<template lang="md">
  # Greeting

  <Hello />

  > You might want to say "Hello" back!
</template>
```

## Using SFCs as Interactive Content Files

You can also create content files with frontmatter within the `src/content` folder using the Analog SFC format by using the `.agx` extension instead of `.analog`. This provides an experience similar to MDX for authoring content:

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

Just like with `.md` files you can dynamically search and filter `.agx` content files using [injectContentFiles](https://analogjs.org/docs/features/routing/content#using-the-content-files-list) and you can render content within a component using [injectContent](https://analogjs.org/docs/features/routing/content#using-the-analog-markdown-component) and the `MarkdownComponent`:

```html
<script lang="ts">
  // posts.[slug].page.analog
  import { injectContent } from '@analogjs/content';
  import { MarkdownComponent } from '@analogjs/content' with { analog: 'imports' }
  import { toSignal } from '@angular/core/rxjs-interop';

  import { PostAttributes } from './models';

  // inject content file based on current slug
  const post$ = injectContent<PostAttributes>();
  const post = toSignal(post$);
</script>

<template>
  @if(post()){
  <analog-markdown [content]="post().content"></analog-markdown>
  }
</template>
```

## Limitations

There are a few limitations to the Analog format:

- You cannot use decorator APIs (`@Input`, `@Component`, `@ViewChild`)
- You must have `lang="ts"` present in the `<script>` tag
