import {
  ENVIRONMENT_INITIALIZER,
  type ApplicationConfig,
  Component,
} from '@angular/core';
import { Route, RouterOutlet, provideRouter } from '@angular/router';

import {
  ROUTE_JSON_LD_KEY,
  updateJsonLdOnRouteChange,
} from '../../src/lib/json-ld';
import { render } from './render';

describe('render', () => {
  it('serializes route JSON-LD into the SSR HTML output', async () => {
    @Component({
      selector: 'app-root',
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class AppComponent {}

    @Component({
      standalone: true,
      template: '<h1>Home</h1>',
    })
    class HomeComponent {}

    const routes: Route[] = [
      {
        path: '',
        component: HomeComponent,
        data: {
          [ROUTE_JSON_LD_KEY]: [
            {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'AnalogJS',
            },
          ],
        },
      },
    ];

    const config: ApplicationConfig = {
      providers: [
        provideRouter(routes),
        {
          provide: ENVIRONMENT_INITIALIZER,
          multi: true,
          useValue: () => updateJsonLdOnRouteChange(),
        },
      ],
    };

    const html = await render(AppComponent, config)(
      '/',
      '<html><head></head><body><app-root></app-root></body></html>',
      {
        req: {
          headers: { host: 'localhost:3000' },
          url: '/',
          originalUrl: '/',
          connection: {},
        } as any,
        res: {} as any,
      },
    );

    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"WebSite"');
  });
});
