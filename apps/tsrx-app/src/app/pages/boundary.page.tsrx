import type { RouteMeta } from '@analogjs/router';
import { input, signal } from '@angular/core';

export const routeMeta: RouteMeta = { title: 'Error boundary' };

function explode(): string {
  throw new Error('Widget failed to render');
}

// Throws while rendering when `fail` is true.
function Flaky() @{
  const fail = input(false);

  <p id="flaky">{fail() ? explode() : 'Widget rendered fine'}</p>
}

export default function BoundaryPage() @{
  const failing = signal(true);
  const retry = (reset: () => void) => {
    failing.set(false);
    reset();
  };

  <section>
    <h1>{'Error boundary'}</h1>
    @try {
      <Flaky fail={failing()} />
    } @catch (err, reset) {
      <div id="fallback">
        <p>{'Caught: '}{(err as Error).message}</p>
        <button id="retry" onClick={() => retry(reset)}>{'Retry'}</button>
      </div>
    }
  </section>
}
