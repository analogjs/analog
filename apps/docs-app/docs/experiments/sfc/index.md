---
sidebar_position: 1
---

# Analog SFCs

> **Note:**
>
> This file format and API is extremely experimental and is a community project, not an official Angular proposal API. Use it at your own risk.

The `.analog` file extension denotes a new file format for Angular Single File Components (SFCs) that aims to simplify the authoring experience of Angular components.

Together, it combines:

- Colocated template, script, and style
- No decorators
- Performance-first defaults (`OnPush` change detection, no accesss to `ngDoCheck`, etc.)

Here's a demonstration of the Analog format building a simple todo list:

```html

<script lang="ts">
  import { signal } from '@angular/core';

  let id = 0;

  interface TodoItem {
    number;
    string;
    boolean;
  }

  const list = signal < TodoItem[] > ([]);

  function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    e.stopPropagation();
    const formData = new FormData(e.target);
    const name = formData.get('name')
    as
    string;
    list.update(prevList => [...prevList, {
      name,
      done: false,
      id: ++id
    }]);
  }

  function onDone(id: number) {
    list.update(prevList => prevList.map(item => {
      if (item.id === id) {
        return {
          ...item,
          done: !item.done
        };
      }
      return item;
    }));
  }
</script>

<template>
  <div class="container">
    <h1>Todo list</h1>
    <ul class="todoList">
      @for (item of list(); track $index) {
        <li class="todoItem">
          <span>{{ item.name }}</span>
          <input type="checkbox" [checked]="item.done" (change)="onDone(item.id)" />
        </li>
      }
    </ul>
    <form (submit)="onSubmit($event)">
      <h2>Add a task</h2>
      <label>
        <div>Task name</div>
        <input name="name" />
      </label>
      <button>Add task</button>
    </form>
  </div>
</template>

<style>
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: 1rem;
    text-align: center;
  }

  .todoList:empty::after {
    content: 'No tasks';
  }

  .todoItem {
    display: flex;
    justify-content: space-between;
  }
</style>
```

# Metadata

While class decorators are used to add metadata to a component or directive in the traditional Angular authoring methods, they're replaced in the Analog format with the `defineMetadata` global function:

```typescript
defineMetadata({
  host: { class: 'block articles-toggle' },
});
```

## Disallowed Metadata Properties

The following properties are not allowed on the metadata fields:

- `template`: Use the SFC `<template>` or `defineMetadata.templateUrl` instead
- `standalone`: Always set to `true`
- `changeDetection`: Always set to `OnPush`
- `styles`: Use the SFC `<style>` tag
- `outputs`: Implicitly added with `new EventEmitter()` usage
- `inputs`: Use the `input` signal API instead

# Using Components

When using the Analog format, you do not need to explicitly export anything; the component is the default export of the `.analog` file:

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import App from './app/app.analog';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
```

Further, when importing an `.analog` file into another `.analog` file, you do not need to add them to your `imports` like you do with non-analog components and directives.

Instead, you can utilize components directly from their imported name:

```html
<!-- layout.analog -->
<script lang="ts">
  import { inject } from '@angular/core';
  import { RouterOutlet } from '@angular/router';
  import { AuthStore } from '../shared-data-access-auth/auth.store';
  import LayoutFooter from '../ui-layout/layout-footer.analog';
  import LayoutHeader from '../ui-layout/layout-header.analog';

  // You still need to add non-Analog items to `imports`:
  defineMetadata({ imports: [RouterOutlet] });

  const authStore = inject(AuthStore);
</script>

<template>
  <LayoutHeader [isAuthenticated]="authStore.isAuthenticated()" [username]="authStore.username()" />
  <router-outlet />
  <LayoutFooter />
</template>
```

# Lifecycle Methods

Currently, only two lifecycle methods from Angular are available to `.analog` SFCs:

- `onInit`
- `onDestroy`

You use these lifecycle methods like so:

```html
<!-- app.analog -->
<script lang="ts">
  onInit(() => {
    console.log("I am mounting");
  })

  onDestroy(() => {
    console.log("I am unmounting");
  })
</script>
```

This encourages best practices when using Angular signals since many of the other lifecycle methods can introduce performance issues or are easily replaced with other APIs.

# Inputs and Outputs

To add inputs and outputs to an Analog component, you use the new Angular signals API.

Let's explore what that looks like in practical terms.

## Inputs

Inputs can be added to a component or directive in the Analog format using [the new `input` signal API](https://angular.io/guide/signal-inputs):

```typescript
const namedInput = input();
```

This will add an input with the name of `namedInput` that can be used in the template like so:

```html
<template>
  <SomeComponent [namedInput]="someValue"/>
</template>
```

## Outputs

Outputs are added in the Analog format like so:

```html
<script lang="ts">
  const selectItem = new EventEmitter();
</script>
```

The above will be transformed to:

```typescript
class Component {
  @Output() selectItem = new EventEmitter();
}
```

And can be used in the template like so:

```html
<template>
  <SomeComponent (selectItem)="doSomething($event)"/>
</template>
```

> In the future, this will be replaced with [the `output` signals API](https://blog.angular.io/meet-angulars-new-output-api-253a41ffa13c).

## Models

The new [`model` signal API](https://angular.io/api/core/model) is not yet supported.

# Dedicated Template and Style Files

If you like the developer experience of Analog's `<script>` to build your logic, but don't want your template and styling in the same file, you can break those out to their own files using:

- `templateUrl`
- `styleUrl`
- `styleUrls`

In `defineMetadata`, like so:

```html
<script lang="ts">
  defineMetadata({
    selector: "app-root",
    templateUrl: "./test.html",
    styleUrl: "./test.css"
  })
  
  onInit(() => {
    alert('Hello World');
  });
</script>
```

# Directives

Any `.analog` file without a `<template>` tag or usage of `templateUrl` in the `defineMetadata` function are treated as Angular Directives.

Here's an example of a directive that focuses an input and has two lifecycle methods:

```html
<script lang="ts">
  import { inject, ElementRef, afterNextRender } from '@angular/core';

  defineMetadata({
    selector: 'input[directive]',
  })

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

# Markdown

If you'd like to write Markdown as your template rather than Angular-enhanced HTML, you can add `lang="md"` to your `<template>` tag in an `.analog` file:

```html
<template lang="md">
  # Hello World
</template>
```

This can be used in combination with the other SFC tags: `<script>` and `<style>`.

# Limitations

There are a few limitations to the Analog format:

- You cannot use decorator APIs (`@Input`, `@Component`, `@ViewChild`)
- You must have `lang="ts"` present in the `<script>`
