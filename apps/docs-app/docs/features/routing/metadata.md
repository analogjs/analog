# Route Metadata

Additional metadata to add to the generated route config for each route can be done using the `RouteMeta` type. This is where you can define the page title, any necessary guards, resolvers, providers, and more.

## Defining Route Metadata

```ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta: RouteMeta = {
  title: 'About Analog',
  canActivate: [() => true],
  providers: [AboutService],
};

@Component({
  selector: 'app-about',
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class AboutPageComponent {
  private readonly service = inject(AboutService);
}
```

## Redirect Routes

Routes can be defined for only the purpose of redirecting to another route.

The example below is a redirect to the `/home` route from `/` route.

Define the `redirectTo` and `pathMatch` inside the route file:

```ts
// src/app/pages/index.page.ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  redirectTo: '/home',
  pathMatch: 'full',
};
```

> An exported route component is not necessary when defining a redirect

## Route Meta Tags

The `RouteMeta` type has a property `meta` which can be used to define a list of meta tags for each route:

```ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta: RouteMeta = {
  title: 'Refresh every 30 sec',
  meta: [
    {
      httpEquiv: 'refresh',
      content: '30',
    },
  ],
};

@Component({
  selector: 'app-refresh',
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    See you again in 30 seconds.
  `,
})
export default class RefreshComponent {}
```

The above example sets meta tag `<meta http-equiv="refresh" content="30">`, which forces the browser to refresh the page every 30 seconds.

To read more about possible standard meta tags, please visit official [docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta).

## Open Graph meta tags

The above property `meta` can also be used to define OpenGraph meta tags for SEO and social apps optimizations:

```ts
export const routeMeta: RouteMeta = {
  meta: [
    {
      name: 'description',
      content: 'Description of the page',
    },
    {
      name: 'author',
      content: 'Analog Team',
    },
    {
      property: 'og:title',
      content: 'Title of the page',
    },
    {
      property: 'og:description',
      content: 'Some catchy description',
    },
    {
      property: 'og:image',
      content: 'https://somepage.com/someimage.png',
    },
  ],
};
```

This example will allow social apps like Facebook or Twitter to display titles, descriptions, and images optimally.
