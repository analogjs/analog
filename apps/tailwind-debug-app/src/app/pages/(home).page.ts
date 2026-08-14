import type { RouteMeta } from '@analogjs/router';
import { routePath } from '@analogjs/router';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { WebPage, WithContext } from 'schema-dts';

export const routeMeta: RouteMeta = {
  title: 'Tailwind Debug App',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    identifier: 'tailwind-debug-home',
    name: 'Tailwind Debug App',
    description:
      'Analog SSR harness for tracing Tailwind component stylesheet HMR.',
    url: 'https://analogjs.org/tailwind-debug',
  } satisfies WithContext<WebPage>,
};

@Component({
  selector: 'app-tailwind-debug-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let probeLink = routePath('/probe');
    <main class="home-shell">
      <section class="hero-card">
        <p class="eyebrow">Analog SSR debug home</p>
        <h1>Tailwind debug app</h1>
        <p class="lede">
          The homepage now renders through SSR and publishes typed JSON-LD for
          the route manifest. The live Tailwind component stylesheet harness
          stays on a client-only route so CSS HMR can keep exercising external
          Angular component styles.
        </p>
        <a class="cta" [routerLink]="probeLink.path">Open the HMR probe</a>
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        color: #e2e8f0;
        background:
          radial-gradient(
            circle at top left,
            rgba(14, 165, 233, 0.22),
            transparent 32%
          ),
          linear-gradient(180deg, #020617 0%, #111827 100%);
      }

      .home-shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
      }

      .hero-card {
        width: min(100%, 52rem);
        display: grid;
        gap: 1rem;
        padding: 2rem;
        border-radius: 1.5rem;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.82);
        box-shadow: 0 24px 80px rgba(2, 6, 23, 0.35);
      }

      .eyebrow {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 0.72rem;
        color: rgba(125, 211, 252, 0.88);
      }

      h1 {
        margin: 0;
        font-size: clamp(2.5rem, 7vw, 4.75rem);
        line-height: 0.95;
        letter-spacing: -0.06em;
      }

      .lede {
        margin: 0;
        max-width: 42rem;
        line-height: 1.75;
        color: rgba(226, 232, 240, 0.82);
      }

      .cta {
        width: fit-content;
        padding: 0.9rem 1.3rem;
        border-radius: 999px;
        color: #020617;
        font-weight: 700;
        text-decoration: none;
        background: linear-gradient(135deg, #7dd3fc, #38bdf8);
      }
    `,
  ],
})
export default class HomeComponent {
  protected readonly routePath = routePath;
}
