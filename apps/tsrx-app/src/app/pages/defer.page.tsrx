import type { RouteMeta } from '@analogjs/router';
import { signal } from '@angular/core';

import { LazyDetails } from '../components/lazy-details.tsrx';
import { HeavyChart } from '../components/heavy-chart.tsrx';
import { LikeButton } from '../components/like-button.tsrx';
import { ServerNote } from '../components/server-note.tsrx';

export const routeMeta: RouteMeta = { title: 'Deferred views' };

// Angular's @defer syntax, written as-is in TSRX.
export default function DeferPage() @{
  const ready = signal(false);

  <section>
    <h1>{'Deferred views'}</h1>

    <h2>{'On interaction'}</h2>
    <button id="load-details" ref="loadDetails">{'Load details'}</button>
    @defer (on interaction(loadDetails)) {
      <LazyDetails />
    } @placeholder {
      <p id="details-placeholder">{'Details load when you click the button.'}</p>
    }

    <h2>{'When a condition becomes true'}</h2>
    <button id="mark-ready" onClick={() => ready.set(true)}>{'Mark ready'}</button>
    @defer (when ready()) {
      <p id="ready-content">{'The condition became true.'}</p>
    } @placeholder {
      <p id="ready-placeholder">{'Waiting for the condition.'}</p>
    }

    <h2>{'Incremental hydration'}</h2>
    <p>{'Server-rendered content whose code loads on the first click:'}</p>
    @defer (hydrate on interaction) {
      <LikeButton />
    }
    @defer (hydrate never) {
      <ServerNote />
    }

    <h2>{'On viewport'}</h2>
    <div class="spacer">{'Scroll down to load the chart.'}</div>
    @defer (on viewport) {
      <HeavyChart />
    } @placeholder {
      <p id="chart-placeholder">{'The chart loads when this scrolls into view.'}</p>
    } @loading (minimum 300ms) {
      <p id="chart-loading">{'Loading chart…'}</p>
    }

    <style>
      .spacer { height: 150vh; }
    </style>
  </section>
}
