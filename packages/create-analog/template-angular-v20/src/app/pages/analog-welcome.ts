import { Component } from '@angular/core';

@Component({
  selector: 'app-analog-welcome',
  styles: [
    `
      :host {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif,
          'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
          'Noto Color Emoji';
        display: flex;
        padding: 2rem 1rem 8rem;
        flex-direction: column;
        background: rgb(250 250 250);
        height: 100%;
      }
      a {
        color: inherit;
        text-decoration: inherit;
      }
      .main {
        margin: 0 auto;
        flex: 1 1 0;
      }
      .intro-section {
        padding-top: 1.5rem;
        padding-bottom: 2rem;
      }
      .intro-section > * + * {
        margin-top: 1.5rem;
      }
      @media (min-width: 768px) {
        .intro-section {
          padding-top: 2.5rem;
          padding-bottom: 3rem;
        }
      }
      @media (min-width: 1024px) {
        .intro-section {
          padding-top: 8rem;
          padding-bottom: 8rem;
        }
      }
      .intro-container {
        display: flex;
        flex-direction: column;
        text-align: center;
        gap: 1rem;
        align-items: center;
        max-width: 64rem;
      }
      .intro-logo {
        height: 3rem;
        width: 3rem;
      }
      .intro-badge {
        transition-property: color, background-color, border-color,
          text-decoration-color, fill, stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        font-weight: 500;
        font-size: 0.875rem;
        line-height: 1.25rem;
        padding: 0.375rem 1rem;
        background-color: rgb(228 228 231);
        border-radius: 1rem;
      }
      .intro-heading {
        margin: 0;
        font-weight: 500;
      }

      @media (min-width: 640px) {
        .intro-heading {
          font-size: 3rem;
          line-height: 1;
        }
      }
      @media (min-width: 768px) {
        .intro-heading {
          font-size: 3.75rem;
          line-height: 1;
        }
      }
      @media (min-width: 1024px) {
        .intro-heading {
          font-size: 4.5rem;
          line-height: 1;
        }
      }
      .intro-analog {
        color: #dd0031;
      }
      .intro-description {
        line-height: 1.5;
        max-width: 42rem;
        margin: 0;
      }

      @media (min-width: 640px) {
        .intro-description {
          line-height: 2rem;
          font-size: 1.25rem;
        }
      }
      .btn-container > * + * {
        margin-left: 1rem;
      }
      .darkBtn {
        transition-property: color, background-color, border-color,
          text-decoration-color, fill, stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        color: rgb(250 250 250);
        font-weight: 500;
        font-size: 0.875rem;
        line-height: 1.25rem;
        padding-left: 2rem;
        padding-right: 2rem;
        background-color: rgb(9 9 11);
        border-radius: 0.375rem;
        justify-content: center;
        align-items: center;
        height: 2.75rem;
        cursor: pointer;
        display: inline-flex;
      }
      .darkBtn:hover {
        background-color: rgb(9 9 11 / 0.9);
      }
      .lightBtn {
        transition-property: color, background-color, border-color,
          text-decoration-color, fill, stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        color: rgb(24, 24, 27);
        background: rgb(250 250 250);
        font-weight: 500;
        font-size: 0.875rem;
        line-height: 1.25rem;
        padding-left: 2rem;
        padding-right: 2rem;
        border-radius: 0.375rem;
        border: 1px solid rgb(229, 231, 235);
        justify-content: center;
        align-items: center;
        height: 2.75rem;
        display: inline-flex;
        cursor: pointer;
      }
      .lightBtn:hover {
        background-color: rgb(244 244 245);
      }
      .counter-section {
        padding-top: 2rem;
        padding-bottom: 2rem;
      }

      @media (min-width: 768px) {
        .counter-section {
          padding-top: 3rem;
          padding-bottom: 3rem;
        }
      }

      @media (min-width: 1024px) {
        .counter-section {
          padding-top: 6rem;
          padding-bottom: 6rem;
        }
      }
      .counter-container {
        text-align: center;
        gap: 1rem;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        max-width: 58rem;
        display: flex;
        margin-left: auto;
        margin-right: auto;
      }
      .counter-heading {
        color: #dd0031;
        line-height: 1.1;
        font-weight: 500;
        font-size: 1.875rem;
        margin: 0;
      }
      .counter-description {
        line-height: 1.5;
        max-width: 85%;
        margin: 0;
      }

      @media (min-width: 640px) {
        .counter-description {
          line-height: 1.75rem;
          font-size: 1.125rem;
        }
      }
      .count {
        margin-left: 0.25rem;
        font-family: Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      }
    `,
  ],
  template: `
    <main class="main">
      <section class="intro-section">
        <div class="intro-container">
          <img
            class="intro-logo"
            src="https://analogjs.org/img/logos/analog-logo.svg"
            alt="AnalogJs logo. Two red triangles and a white analog wave in front"
          />
          <a
            class="intro-badge"
            target="_blank"
            href="https://twitter.com/analogjs"
            >Follow along on Twitter</a
          >
          <h1 class="intro-heading">
            <span class="intro-analog">Analog.</span> The fullstack Angular
            meta-framework
          </h1>
          <p class="intro-description">
            Analog is for building applications and websites with Angular.
            <br />Powered by Vite.
          </p>
          <div class="btn-container">
            <a class="darkBtn" href="https://analogjs.org">Read the docs</a>
            <a
              target="_blank"
              rel="noreferrer"
              class="lightBtn"
              href="https://github.com/analogjs/analog"
              >Star on GitHub</a
            >
          </div>
        </div>
      </section>
    <section id="counter-demo" class="section">
        <div class="counter-container">
          <h2 class="counter-heading">Counter</h2>
          <p class="counter-description">
            This is a simple interactive counter. Powered by Angular.
          </p>
          <button (click)="increment()" class="lightBtn">
            Count: <span class="count">{{ count }}</span>
          </button>
        </div>
      </section>
    </main>
  `,
})
export class AnalogWelcome {
  count = 0;

  increment() {
    this.count++;
  }
}
