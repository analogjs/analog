import { Component } from '@angular/core';

@Component({
  selector: 'app-tailwind-debug-analog-welcome',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        padding: 3rem 1.5rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }

      .welcome {
        margin: 0 auto;
        max-width: 48rem;
      }

      h1 {
        margin: 0 0 1rem;
        font-size: 2.5rem;
        line-height: 1.1;
      }

      p {
        margin: 0;
        color: rgb(82 82 91);
        font-size: 1.125rem;
        line-height: 1.75rem;
      }
    `,
  ],
  template: `
    <main class="welcome">
      <h1>Tailwind Debug App</h1>
      <p>Use this app to verify Tailwind and Analog integration behavior.</p>
    </main>
  `,
})
export class AnalogWelcomeComponent {}
