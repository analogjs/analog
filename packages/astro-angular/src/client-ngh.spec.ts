// @vitest-environment jsdom
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import type { SSRResult } from 'astro';
import serverNgh from './server-ngh';
import clientNgh from './client-ngh';

const ToggleComponent = Component({
  selector: 'app-toggle',
  template: `
    <button (click)="show.set(!show())">Toggle</button>
    @if (show()) {
      <ng-content />
    }
  `,
})(
  class ToggleComponent {
    show = signal(true);
  },
);

async function renderAndHydrate(slots: Record<string, string>) {
  const { html } = await serverNgh.renderToStaticMarkup.call(
    { result: {} as SSRResult },
    ToggleComponent,
    { 'data-analog-id': 'toggle-1' },
    slots,
    { hydrate: 'load' } as any,
  );

  // The server renderer leaves `ngServerMode` on; the browser bundle defines it as false.
  globalThis.ngServerMode = false;

  const island = document.createElement('astro-island');
  island.innerHTML = html;
  document.body.appendChild(island);

  const ssrNode = island.querySelector('app-toggle > p');
  const appRef = (await clientNgh(island)(ToggleComponent, {}, slots))!;
  const instance = appRef.components[0].instance as {
    show: ReturnType<typeof signal<boolean>>;
  };

  return { island, ssrNode, appRef, instance };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('client-ngh content projection', () => {
  it('should reuse the server-rendered projected nodes and toggle them cleanly', async () => {
    const { island, ssrNode, appRef, instance } = await renderAndHydrate({
      default: '<p>Projected</p>',
    });

    expect(ssrNode).not.toBeNull();
    expect(island.querySelector('app-toggle > p')).toBe(ssrNode);

    instance.show.set(false);
    await appRef.whenStable();
    expect(island.querySelectorAll('p')).toHaveLength(0);
    expect(island.textContent).not.toContain('Projected');

    instance.show.set(true);
    await appRef.whenStable();
    expect(island.querySelectorAll('p')).toHaveLength(1);
    expect(island.querySelector('app-toggle > p')).toBe(ssrNode);
  });
});
