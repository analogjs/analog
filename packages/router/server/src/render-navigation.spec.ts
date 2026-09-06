import {
  Component,
  DestroyRef,
  inject,
  provideAppInitializer,
  type ApplicationConfig,
} from '@angular/core';
import {
  RouterOutlet,
  provideRouter,
  RedirectCommand,
  Router,
  withNavigationErrorHandler,
} from '@angular/router';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from './render';
import { renderStream } from './render-stream';

@Component({
  selector: 'analogjs-test-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class Root {}
@Component({ standalone: true, template: '<h1>Rendered page</h1>' })
class Page {}
@Component({
  selector: 'analogjs-plain',
  standalone: true,
  template: '<h1>Standalone render</h1>',
})
class Plain {}
const document =
  '<html><head></head><body><analogjs-test-root /></body></html>';
const sockets: Socket[] = [];
function context(path: string) {
  const socket = new Socket();
  sockets.push(socket);
  const req = Object.assign(new IncomingMessage(socket), { originalUrl: path });
  req.headers.host = 'localhost';
  return { req, res: new ServerResponse(req), streaming: false };
}
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy();
});

describe('SSR navigation failures', () => {
  it('preserves standalone rendering without router providers', async () => {
    expect(
      await render(Plain, { providers: [] })(
        '/',
        '<html><body><analogjs-plain /></body></html>',
        context('/'),
      ),
    ).toContain('Standalone render');
  });
  for (const renderer of [
    { name: 'render', create: render },
    { name: 'buffered renderStream', create: renderStream },
  ]) {
    it(`${renderer.name} rejects the original resolver error and disposes its application`, async () => {
      const failure = Object.assign(new Error('private-render-failure'), {
        statusCode: 422,
      });
      let destroyed = 0;
      const config: ApplicationConfig = {
        providers: [
          provideRouter([
            {
              path: '',
              component: Page,
              resolve: { data: () => Promise.reject(failure) },
            },
          ]),
          provideAppInitializer(() =>
            inject(DestroyRef).onDestroy(() => destroyed++),
          ),
        ],
      };
      await expect(
        renderer.create(Root, config)('/', document, context('/')),
      ).rejects.toBe(failure);
      expect(destroyed).toBe(1);
    });
  }

  it('does not reject a navigation error handled by a redirect', async () => {
    const config: ApplicationConfig = {
      providers: [
        provideRouter(
          [
            {
              path: 'failed',
              component: Page,
              resolve: {
                data: () => {
                  throw new Error('handled');
                },
              },
            },
            { path: 'recovered', component: Page },
          ],
          withNavigationErrorHandler(
            () => new RedirectCommand(inject(Router).parseUrl('/recovered')),
          ),
        ),
      ],
    };
    expect(
      await render(Root, config)('/failed', document, context('/failed')),
    ).toContain('Rendered page');
  });

  it('keeps failure state local to concurrent requests', async () => {
    const failure = Object.assign(new Error('one request only'), {
      status: 503,
    });
    const config: ApplicationConfig = {
      providers: [
        provideRouter([
          {
            path: 'failed',
            component: Page,
            resolve: { data: () => Promise.reject(failure) },
          },
          { path: 'success', component: Page },
        ]),
      ],
    };
    const renderer = render(Root, config);
    const [failed, success] = await Promise.allSettled([
      renderer('/failed', document, context('/failed')),
      renderer('/success', document, context('/success')),
    ]);
    expect(failed).toEqual({ status: 'rejected', reason: failure });
    expect(success.status).toBe('fulfilled');
    if (success.status === 'fulfilled')
      expect(success.value).toContain('Rendered page');
  });
});
