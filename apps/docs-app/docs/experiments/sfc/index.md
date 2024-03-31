---
sidebar_position: 1
---

# Analog SFCs

> **Note:**
>
> This file format and API is extremely experimental and is a community project, not an official Angular proposal API. Use it at your own risk.

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

# Inputs and Outputs

To use inputs and outputs use the signals APIs for them

## Inputs

Inputs can be added to a component or directive in the Analog format using [the new `input` signal API](https://angular.io/guide/signal-inputs):

```typescript
const name = input();
```

## Outputs

Outputs are added in the Analog format like so:

```html
<script lang="ts">
const selectFeed = new EventEmitter();
</script>
```

The above will be transformed to:

```typescript
class Component {
  @Output() selectFeed = new EventEmitter();
}
```

> In the future, this will be replaced with [the `output` signals API](https://blog.angular.io/meet-angulars-new-output-api-253a41ffa13c).

## Models

The new [`model` signal API](https://angular.io/api/core/model) is not yet supported.

# Dedicated Template and Style Files

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

```html
<template lang="md">
  # Hello World
</template>
```

<!-- Can this be mixed and matched with `<script>`? -->

<!-- Can this be mixed and matched with `<style>`? -->

# Limitations

- Cannot use decorator APIs (`@Input`, `@Component`, `@ViewChild`)
- You must have `lang="ts"` present in the `<script>`

