import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StyleProbeComponent } from './style-probe.component';

@Component({
  selector: 'app-tailwind-debug-shell',
  standalone: true,
  imports: [StyleProbeComponent],
  styleUrls: ['./tailwind-debug-shell.component.css'],
  template: `
    <main class="shell" data-testid="debug-shell">
      <section class="hero">
        <p class="eyebrow">Analog tailwind debug app</p>
        <h1 class="headline">
          Wiretap-first repro harness for Angular CSS HMR
        </h1>
        <p class="lede">
          This app exists to reproduce and trace prefixed Tailwind component
          stylesheet updates, wrapper/direct stylesheet identities, and any
          accidental full reloads emitted during the same edit cycle.
        </p>
      </section>

      <section class="workspace">
        <app-tailwind-style-probe />
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TailwindDebugShellComponent {}
