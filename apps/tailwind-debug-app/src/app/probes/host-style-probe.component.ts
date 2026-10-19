import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-host-style-probe',
  standalone: true,
  styleUrls: ['./host-style-probe.component.css'],
  template: `
    <section data-testid="host-probe-card">
      <p class="host-probe-kicker">:host component stylesheet</p>
      <h2 class="host-probe-title">@apply inside :host probe</h2>
      <p class="host-probe-copy">
        This card is styled via <code>:host</code> using
        <code>&#64;apply</code> with <code>tdbg:</code>-prefixed Tailwind
        utilities. If this card has no background color or padding, the
        <code>:host</code> + <code>&#64;apply</code> pipeline is broken.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HostStyleProbeComponent {}
