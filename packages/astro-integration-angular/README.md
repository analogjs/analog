# @analogjs/astro-integration-angular

An Angular integration for Astro

## Setup

Install dependencies

```sh
yarn add @analogjs/astro-integration-angular --dev
```

Add Angular to `integrations` array and enable `experimental.integrations`

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-integration-angular';

export default defineConfig({
  integrations: [angular()],
  experimental: {
    integrations: true,
  },
});
```

## Defining A Component

The Astro Angular integration **only** supports bootstrapping standalone components:

```ts
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-hello',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p>Hello from Angular!!</p>

    <p *ngIf="show">help</p>

    <button (click)="toggle()">Toggle</button>
  `,
})
export class HelloComponent {
  show = false;

  toggle() {
    this.show = !this.show;
  }
}
```

And add the Angular component to the Astro component:

```ts
---
import { HelloComponent } from '../components/hello.component.ts';
---

<HelloComponent client:visible />
```
