import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: 'app-tailwind-style-probe',
  standalone: true,
  styleUrls: ['./style-probe.component.css'],
  template: `
    <section class="probe-card" data-testid="probe-card">
      <p class="probe-kicker">Component stylesheet</p>
      <h2 class="probe-title">Tailwind-prefixed CSS HMR probe</h2>
      <p class="probe-copy">
        This card is intentionally styled through an external Angular component
        stylesheet using <code>tdbg:</code>-prefixed Tailwind utilities.
      </p>

      <div class="probe-toolbar">
        <span class="probe-chip" data-testid="probe-color-chip">
          Expect blue or red without a page reload
        </span>
        <button
          type="button"
          class="probe-button"
          data-testid="probe-counter"
          (click)="increment()"
        >
          Clicks {{ count() }}
        </button>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleProbeComponent {
  readonly count = signal(0);

  increment() {
    this.count.update((value) => value + 1);
  }
}
