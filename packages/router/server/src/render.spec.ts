/* eslint-disable @angular-eslint/component-selector */
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

  it('escapes HTML-sensitive JSON-LD values in SSR output', async () => {
    @Component({
      selector: 'app-root',
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class AppComponent {}

    @Component({
      standalone: true,
      template: '<h1>Article</h1>',
    })
    class ArticleComponent {}

    const routes: Route[] = [
      {
        path: '',
        component: ArticleComponent,
        data: {
          [ROUTE_JSON_LD_KEY]: [
            {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: '</script><script>alert("xss")</script>',
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

    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).not.toContain('</script><script>alert("xss")</script>');
  });

  it('serializes multiple JSON-LD entries in SSR output', async () => {
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
              identifier: 'site',
            },
            {
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: 'Products',
              identifier: 'catalog',
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

    // Should contain both entries as separate script tags
    const matches = html.match(/application\/ld\+json/g);
    expect(matches).toHaveLength(2);
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('"@type":"CollectionPage"');
  });

  it('does not inject JSON-LD scripts when route has none', async () => {
    @Component({
      selector: 'app-root',
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class AppComponent {}

    @Component({
      standalone: true,
      template: '<h1>No LD</h1>',
    })
    class PlainComponent {}

    const routes: Route[] = [
      {
        path: '',
        component: PlainComponent,
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

    expect(html).not.toContain('application/ld+json');
    expect(html).not.toContain('data-analog-json-ld');
  });

  it('serializes Graph-based JSON-LD in SSR output', async () => {
    @Component({
      selector: 'app-root',
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class AppComponent {}

    @Component({
      standalone: true,
      template: '<h1>Graph</h1>',
    })
    class GraphComponent {}

    const routes: Route[] = [
      {
        path: '',
        component: GraphComponent,
        data: {
          [ROUTE_JSON_LD_KEY]: [
            {
              '@context': 'https://schema.org',
              '@graph': [
                { '@type': 'WebSite', name: 'AnalogJS' },
                { '@type': 'Organization', name: 'Analog Inc' },
              ],
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
    expect(html).toContain('@graph');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('"@type":"Organization"');
  });
});
