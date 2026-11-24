import type { RouteMeta } from '@analogjs/router';
import { signal } from '@angular/core';

import { Card } from '../components/card.tsrx';
import { Panel } from '../components/panel';

export const routeMeta: RouteMeta = { title: 'Content projection' };

export default function ProjectionPage() @{
  const clicks = signal(0);
  const expanded = signal(false);

  <section>
    <h1>{'Content projection'}</h1>

    <div id="full-card">
      <Card>
        <h2 card-title ref="title">{'Projected title'}</h2>
        <p id="card-body">{'Clicked '}{clicks()}{' times.'}</p>
        <button id="card-click" onClick={() => clicks.update((n) => n + 1)}>
          {'Click'}
        </button>
        <button id="card-expand" onClick={() => expanded.update((v) => !v)}>
          {'Toggle details'}
        </button>
        @if (expanded()) {
          <p id="card-details">{'Conditionally projected details.'}</p>
        }
        <small card-footer>{'A projected footer.'}</small>
      </Card>
    </div>

    <div id="bare-card">
      <Card>
        <p>{'Only default content, so the footer falls back.'}</p>
      </Card>
    </div>

    <div id="panel">
      <Panel heading="A .ts component">
        <p id="panel-body">{'TSRX markup projected into it, clicked '}{clicks()}{' times.'}</p>
      </Panel>
    </div>
  </section>
}
