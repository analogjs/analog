import '@angular/compiler';
import { Component } from '@angular/core';
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
