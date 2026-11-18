import type { RouteMeta } from '@analogjs/router';
import {
  Component,
  computed,
  inject,
  Injectable,
  input,
  model,
  output,
  signal,
} from '@angular/core';

export const routeMeta: RouteMeta = { title: 'Counter' };

/** Provided per counter through `CounterMeta.providers`. */
@Injectable()
export class CounterHistory {
  readonly entries = signal<number[]>([]);

  record(value: number): void {
    this.entries.update((entries) => [...entries, value]);
  }
}

// A two-way `model()`, with a host binding that reads it.
export const StepperMeta = {
  selector: 'demo-stepper',
  host: { class: 'stepper', '[attr.data-step]': 'step()' },
} satisfies Component;

function Stepper() @{
  const step = model(1);

  <label>
    {'Step '}
    <input
      id="step"
      type="number"
      min="1"
      value={step()}
      onInput={(event: Event) =>
        step.set(Number((event.target as HTMLInputElement).value) || 1)}
    />
  </label>
}

// Inputs, an output, a component-level provider and scoped styles.
export const CounterMeta = {
  selector: 'demo-counter',
  providers: [CounterHistory],
} satisfies Component;

function Counter() @{
  const label = input.required<string>();
  const step = input(1);
  const changed = output<number>();

  const history = inject(CounterHistory);
  const count = signal(0);
  const doubled = computed(() => count() * 2);

  const increment = () => {
    count.update((value) => value + step());
    history.record(count());
    changed.emit(count());
  };

  <div class="counter">
    <button id="increment" onClick={increment}>{label()}: {count()}</button>
    <p id="doubled">{'doubled: '}{doubled()}</p>
    <p id="history">{'history: '}{history.entries().join(', ') || 'none'}</p>
    <style>
      .counter { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; max-width: 20rem; }
    </style>
  </div>
}

export default function CounterPage() @{
  const step = signal(2);
  const last = signal<number | null>(null);

  <section>
    <h1>{'Signals and component APIs'}</h1>
    <Stepper bind:step={step} />
    <Counter label="Clicks" step={step()} onChanged={(value: number) => last.set(value)} />
    <p id="last">{'last emitted: '}{last() ?? 'none'}</p>
  </section>
}
