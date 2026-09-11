import '@angular/compiler';
import { APP_BOOTSTRAP_LISTENER, Component } from '@angular/core';
import type { SSRResult } from 'astro';
import server from './server';
import serverNgh from './server-ngh';

const CardComponent = Component({
  selector: 'app-card',
  inputs: ['title'],
  template: `
    <h2>{{ title }}</h2>
    <div class="card__header"><ng-content select="[question]" /></div>
    <div class="card__body"><ng-content>Fallback</ng-content></div>
  `,
})(
  class CardComponent {
    title = '';
  },
);

const children = {
  default:
    '<p question>Is content projection cool?</p>' +
    "<p>Let's learn about content projection!</p>",
};

type Render = (
  props: Record<string, unknown>,
  slots: unknown,
) => Promise<{ html: string }>;

// Hydration annotations add comment nodes, which are irrelevant here.
const stripComments = (html: string) => html.replace(/<!--[^>]*-->/g, '');

const renderers: [string, Render][] = [
  [
    'server',
    async (props, slots) => {
      const { html } = await server.renderToStaticMarkup(
        CardComponent as any,
        props,
        slots,
      );
      return { html: stripComments(html) };
    },
  ],
  [
    'server-ngh',
    async (props, slots) => {
      const { html } = await serverNgh.renderToStaticMarkup.call(
        { result: {} as SSRResult },
        CardComponent,
        props,
        slots,
        { hydrate: 'load' } as any,
      );
      return { html: stripComments(html) };
    },
  ],
];

// Regression: passing native `projectableNodes` for a root component must not
// trip Angular's NG0503 check, which only covers components nested inside a
// serialized template. The host is annotated for hydration as usual.
it('server-ngh should annotate the host for hydration with projected content', async () => {
  const { html } = await renderers[1][1]({}, children);

  expect(html).toMatch(/<app-card [^>]*ngh="\d+"/);
  expect(html).toContain('Is content projection cool?');
});

describe.each(renderers)('%s renderToStaticMarkup', (_name, render) => {
  it('should bind inputs and project children', async () => {
    const { html } = await render({ title: 'Card', ignored: 'x' }, children);

    expect(html).toContain('<h2>Card</h2>');
    expect(html).toMatch(
      /<div class="card__header"><p question="">Is content projection cool\?<\/p>/,
    );
    expect(html).toMatch(
      /<div class="card__body"><p>Let's learn about content projection!<\/p>/,
    );
    expect(html).not.toContain('Fallback');
  });

  it('should project text-only children', async () => {
    const { html } = await render({}, { default: 'Hello World' });

    expect(html).toMatch(/<div class="card__body">Hello World<\/div>/);
  });

  it('should render ng-content fallbacks without children', async () => {
    const { html } = await render({}, {});

    expect(html).toMatch(/<div class="card__body">Fallback<\/div>/);
  });
});

describe('APP_BOOTSTRAP_LISTENER', () => {
  const listener = vi.fn();

  const ListenerComponent = Component({
    selector: 'app-listener',
    template: `<p>Listener</p>`,
  })(
    class ListenerComponent {
      static renderProviders = [
        { provide: APP_BOOTSTRAP_LISTENER, useValue: listener, multi: true },
      ];
    },
  );

  beforeEach(() => listener.mockClear());

  it('server should invoke bootstrap listeners with the component ref', async () => {
    await server.renderToStaticMarkup(ListenerComponent as any, {}, {});

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].instance).toBeInstanceOf(
      ListenerComponent,
    );
  });

  it('server-ngh should invoke bootstrap listeners with the component ref', async () => {
    await serverNgh.renderToStaticMarkup.call(
      { result: {} as SSRResult },
      ListenerComponent,
      {},
      {},
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].instance).toBeInstanceOf(
      ListenerComponent,
    );
  });
});
