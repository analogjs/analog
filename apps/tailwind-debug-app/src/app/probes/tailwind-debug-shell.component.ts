import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StyleProbeComponent } from './style-probe.component';

@Component({
  selector: 'app-tailwind-debug-shell',
  standalone: true,
  imports: [StyleProbeComponent],
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
  styles: [
    `
      .shell {
        display: grid;
        min-height: 100vh;
        gap: 2rem;
        padding: 3rem;
        background:
          radial-gradient(
            circle at top left,
            rgba(56, 189, 248, 0.22),
            transparent 36%
          ),
          radial-gradient(
            circle at right center,
            rgba(59, 130, 246, 0.18),
            transparent 28%
          ),
          linear-gradient(180deg, #020617 0%, #0f172a 100%);
      }

      .hero {
        display: grid;
        gap: 1rem;
        max-width: 56rem;
      }

      .workspace {
        display: grid;
        grid-template-columns: minmax(0, 28rem) minmax(0, 1fr);
        gap: 1.5rem;
        align-items: start;
      }

      .eyebrow {
        margin: 0;
        letter-spacing: 0.26em;
        text-transform: uppercase;
        font-size: 0.75rem;
        font-weight: 700;
        color: rgba(226, 232, 240, 0.76);
      }

      .headline {
        margin: 0;
        font-size: clamp(2.75rem, 5vw, 5rem);
        line-height: 0.95;
        letter-spacing: -0.06em;
      }

      .lede {
        margin: 0;
        max-width: 48rem;
        font-size: 1rem;
        line-height: 1.75;
        color: rgba(226, 232, 240, 0.8);
      }

      @media (max-width: 960px) {
        .workspace {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TailwindDebugShellComponent {}
