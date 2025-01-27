import { Route } from '@angular/router';
import { of } from 'rxjs';
import { expect, vi } from 'vitest';
import { RouteExport, RouteMeta } from './models';
import { createRoutes, Files } from './routes';
import { ROUTE_META_TAGS_KEY } from './meta-tags';

describe('routes', () => {
  class RouteComponent {}

  it('should return an empty array of routes when files record is empty', () => {
    const routes = createRoutes({});
    expect(routes).toEqual([]);
  });

  describe('a root static route', () => {
    const files: Files = {
      '/app/routes/about.ts': () =>
        Promise.resolve<RouteExport>({
          default: RouteComponent,
          routeMeta: {
            title: 'About',
          },
        }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('about');
    });

    it('should have a loadChildren property', () => {
      expect(route.loadChildren).toBeDefined();
      expect(typeof route.loadChildren).toBe('function');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });

    it('should contain the route meta properties in the inner route', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.title).toBe('About');
    });
  });

  describe('a nested static route', () => {
    const files: Files = {
      '/src/app/pages/auth/login.page.ts': () =>
        Promise.resolve<RouteExport>({
          default: RouteComponent,
        }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('auth');
      expect(route.children[0].path).toBe('login');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.children[0].loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a nested static route with pathless segments', () => {
    const files: Files = {
      '/src/app/pages/(foo)/auth/(bar)/login.page.ts': () =>
        Promise.resolve<RouteExport>({
          default: RouteComponent,
        }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('');
      expect(route.children[0].path).toBe('auth');
      expect(route.children[0].children[0].path).toBe('');
      expect(route.children[0].children[0].children[0].path).toBe('login');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes =
        (await route.children[0].children[0].children[0].loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a root dynamic route', () => {
    const files: Files = {
      '/app/routes/blog.[slug].ts': () =>
        Promise.resolve({
          default: RouteComponent,
        }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('blog/:slug');
    });

    it('should have a loadChildren property', () => {
      expect(route.loadChildren).toBeDefined();
      expect(typeof route.loadChildren).toBe('function');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a root dynamic route with multiple dynamic segments', () => {
    const files: Files = {
      '/app/routes/categories.[categoryId].products.[productId].ts': () =>
        Promise.resolve({ default: RouteComponent }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('categories/:categoryId/products/:productId');
    });

    it('should have a loadChildren property', () => {
      expect(route.loadChildren).toBeDefined();
      expect(typeof route.loadChildren).toBe('function');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a root dynamic route with multiple dynamic segments and page suffix', () => {
    const files: Files = {
      '/app/pages/[productId].[partId].page.ts': () =>
        Promise.resolve({ default: RouteComponent }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe(':productId/:partId');
    });

    it('should have a loadChildren property', () => {
      expect(route.loadChildren).toBeDefined();
      expect(typeof route.loadChildren).toBe('function');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a nested dynamic route', () => {
    const files: Files = {
      '/src/app/pages/[categoryId]/[productId].page.ts': () =>
        Promise.resolve({ default: RouteComponent }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe(':categoryId');
      expect(route.children[0].path).toBe(':productId');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.children[0].loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('an index route', () => {
    const files: Files = {
      '/app/routes/index.ts': () =>
        Promise.resolve({ default: RouteComponent }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('');
    });

    it('should have a loadChildren property', () => {
      expect(route.loadChildren).toBeDefined();
      expect(typeof route.loadChildren).toBe('function');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a named index route', () => {
    const files: Files = {
      '/app/routes/(home).ts': () =>
        Promise.resolve({ default: RouteComponent }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('');
    });

    it('should have a loadChildren property', () => {
      expect(route.loadChildren).toBeDefined();
      expect(typeof route.loadChildren).toBe('function');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a layout route', () => {
    class LayoutComponent {}

    const files: Files = {
      '/app/routes/products.ts': () =>
        Promise.resolve({ default: LayoutComponent }),
      '/app/routes/products/[productId].ts': () =>
        Promise.resolve({ default: RouteComponent }),
    };

    const routes = createRoutes(files);
    const layoutRoute = routes[0];

    describe('layout route', () => {
      it('should have a path', () => {
        expect(layoutRoute.path).toBe('products');
      });

      it('should have a loadChildren property', () => {
        expect(layoutRoute.loadChildren).toBeDefined();
        expect(typeof layoutRoute.loadChildren).toBe('function');
      });

      it('should return an array of one route config from the loadChildren property', async () => {
        const routes = (await layoutRoute.loadChildren()) as Route[];

        expect(routes.length).toBe(1);

        const innerRoute = routes.shift();

        expect(innerRoute.path).toBe('');
        expect(innerRoute.component).toBe(LayoutComponent);
      });
    });

    describe('child route', () => {
      it('should come from the layout route', async () => {
        const routes = (await layoutRoute.loadChildren()) as Route[];
        const innerRoute = routes.shift();

        expect(innerRoute.path).toBe('');
        expect(innerRoute.children).toBeDefined();

        const childRoute = innerRoute.children.shift();

        expect(childRoute.path).toBe(':productId');
        expect(childRoute.loadChildren).toBeDefined();

        const innerChildRoutes = (await childRoute.loadChildren()) as Route[];
        const innerChildRoute = innerChildRoutes[0];

        expect(innerChildRoute.path).toBe('');
        expect(innerChildRoute.component).toBe(RouteComponent);
      });
    });
  });

  describe('a pathless layout route', () => {
    class LayoutComponent {}

    const files: Files = {
      '/src/app/pages/(auth).page.ts': () =>
        Promise.resolve({ default: LayoutComponent }),
      '/src/app/pages/(auth)/login.page.ts': () =>
        Promise.resolve({ default: RouteComponent }),
    };

    const routes = createRoutes(files);
    const layoutRoute = routes[0];

    describe('layout route', () => {
      it('should have a path', () => {
        expect(layoutRoute.path).toBe('');
      });

      it('should have a loadChildren property', () => {
        expect(layoutRoute.loadChildren).toBeDefined();
        expect(typeof layoutRoute.loadChildren).toBe('function');
      });

      it('should return an array of one route config from the loadChildren property', async () => {
        const routes = (await layoutRoute.loadChildren()) as Route[];

        expect(routes.length).toBe(1);

        const innerRoute = routes.shift();

        expect(innerRoute.path).toBe('');
        expect(innerRoute.component).toBe(LayoutComponent);
      });
    });

    describe('child route', () => {
      it('should come from the layout route', async () => {
        const routes = (await layoutRoute.loadChildren()) as Route[];
        const innerRoute = routes.shift();

        expect(innerRoute.path).toBe('');
        expect(innerRoute.children).toBeDefined();

        const childRoute = innerRoute.children.shift();

        expect(childRoute.path).toBe('login');
        expect(childRoute.loadChildren).toBeDefined();

        const innerChildRoutes = (await childRoute.loadChildren()) as Route[];
        const innerChildRoute = innerChildRoutes[0];

        expect(innerChildRoute.path).toBe('');
        expect(innerChildRoute.component).toBe(RouteComponent);
      });
    });
  });

  describe('a catchall route', () => {
    const files: Files = {
      '/app/routes/[...not-found].ts': () =>
        Promise.resolve({
          default: RouteComponent,
        }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('**');
    });

    it('should have a loadChildren property', () => {
      expect(route.loadChildren).toBeDefined();
      expect(typeof route.loadChildren).toBe('function');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a catchall route with page suffix', () => {
    const files: Files = {
      '/src/app/pages/[...page-not-found].page.ts': () =>
        Promise.resolve({
          default: RouteComponent,
        }),
    };

    const routes = createRoutes(files);
    const route = routes[0];

    it('should have a path', () => {
      expect(route.path).toBe('**');
    });

    it('should have a loadChildren property', () => {
      expect(route.loadChildren).toBeDefined();
      expect(typeof route.loadChildren).toBe('function');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await route.loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a nested catchall route', () => {
    const files: Files = {
      '/src/app/pages/users/[...not-found].page.ts': () =>
        Promise.resolve({
          default: RouteComponent,
        }),
    };

    const routes = createRoutes(files);
    const parentRoute = routes[0];

    it('should have a path', () => {
      expect(parentRoute.path).toBe('users');
      expect(parentRoute.children[0].path).toBe('**');
    });

    it('should return an array of one route config from the loadChildren property', async () => {
      const routes = (await parentRoute.children[0].loadChildren()) as Route[];

      expect(routes.length).toBe(1);

      const innerRoute = routes.shift();

      expect(innerRoute.path).toBe('');
      expect(innerRoute.component).toBe(RouteComponent);
    });
  });

  describe('a route with meta tags', () => {
    async function setup(routeMeta: RouteMeta) {
      const files: Files = {
        '/app/routes/index.ts': () =>
          Promise.resolve({ default: RouteComponent, routeMeta }),
      };
      const moduleRoute = createRoutes(files)[0];
      const resolvedRoutes = (await moduleRoute.loadChildren?.()) as Route[];

      return { resolvedRoute: resolvedRoutes[0] };
    }

    it('should add meta tags to data dictionary when they are defined as array', async () => {
      const routeMeta: RouteMeta = {
        data: { foo: 'bar' },
        resolve: { x: () => of('y'), load: expect.anything() },
        meta: [
          { charset: 'utf-8' },
          {
            name: 'description',
            content: 'Books Description',
          },
        ],
      };
      const { resolvedRoute } = await setup(routeMeta);

      expect(resolvedRoute.data).toEqual({
        ...routeMeta.data,
        [ROUTE_META_TAGS_KEY]: routeMeta.meta,
      });
      // routeMeta.data should not be mutated
      expect(routeMeta.data).not.toBe(resolvedRoute.data);
      // routeMeta.resolve should not be changed
      expect(resolvedRoute.resolve).toStrictEqual(routeMeta.resolve);
    });

    it('should add meta tags to resolve dictionary when they are defined as resolver', async () => {
      const routeMeta: RouteMeta = {
        resolve: { foo: () => of('bar') },
        data: { x: 1, y: 2 },
        meta: () =>
          of([
            { charset: 'utf-8' },
            {
              name: 'description',
              content: 'Books Description',
            },
          ]),
      };
      const { resolvedRoute } = await setup(routeMeta);

      expect(resolvedRoute.resolve).toEqual({
        ...routeMeta.resolve,
        [ROUTE_META_TAGS_KEY]: routeMeta.meta,
        load: expect.anything(),
      });
      // routeMeta.resolve should not be mutated
      expect(routeMeta.resolve).not.toBe(resolvedRoute.resolve);
      // routeMeta.data should not be changed
      expect(resolvedRoute.data).toBe(routeMeta.data);
    });
  });

  describe('routes order', () => {
    const module = () => Promise.resolve({ default: RouteComponent });

    const files: Files = {
      '/src/app/pages/[...not-found].page.ts': module,
      '/src/app/pages/static/[...not-found].page.ts': module,
      '/src/app/pages/static/[dynamic].page.ts': module,
      '/src/app/pages/[dynamic].page.ts': module,
      '/src/app/pages/static/static.page.ts': module,
      '/src/app/pages/static.page.ts': module,
      '/src/app/pages/static-2.page.ts': module,
    };

    const routes = createRoutes(files);

    it('should put root catchall route at the end', () => {
      expect(routes.at(-1).path).toBe('**');
    });

    it('should put nested catchall route at the end', async () => {
      const routeWithChildren = routes.find((route) => route.path === 'static');
      const nestedRoutes = (await routeWithChildren.loadChildren()) as Route[];

      expect(nestedRoutes[0].children.at(-1).path).toBe('**');
    });

    it('should put root dynamic route after static routes but before catchall', () => {
      expect(routes.at(-2).path).toBe(':dynamic');
    });

    it('should put nested dynamic route after static routes but before catchall', async () => {
      const routeWithChildren = routes.find((route) => route.path === 'static');
      const nestedRoutes = (await routeWithChildren.loadChildren()) as Route[];

      expect(nestedRoutes[0].children.at(-2).path).toBe(':dynamic');
    });

    it('should put static routes with fewer children first', () => {
      expect(routes[0].path).toBe('static-2');
      expect(routes[1].path).toBe('static');
    });
  });

  describe('a route without default export', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should log a warning when default export is falsy', async () => {
      const fileName = '/app/routes/index.ts';
      const files: Files = {
        [fileName]: () => Promise.resolve({} as unknown as RouteExport),
      };

      const routes = createRoutes(files);
      const route = routes[0];

      const spy = vi.spyOn(console, 'warn');

      await route.loadChildren?.();

      expect(spy).toHaveBeenCalledWith(
        `[Analog] Missing default export at ${fileName}`
      );
    });

    it('should not log a warning default export is falsy with a redirect', async () => {
      const fileName = '/app/routes/index.ts';
      const files: Files = {
        [fileName]: () =>
          Promise.resolve({
            routeMeta: { redirectTo: '/home' },
          } as unknown as RouteExport),
      };

      const routes = createRoutes(files);
      const route = routes[0];

      const spy = vi.spyOn(console, 'warn');

      await route.loadChildren?.();

      expect(spy).not.toHaveBeenCalledWith(
        `[Analog] Missing default export at ${fileName}`
      );
    });
  });
});
