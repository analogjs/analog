import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from './header.component';
import type { User } from './user';

@Component({
  selector: 'analogjs-storybook-page',
  imports: [CommonModule, HeaderComponent],
  template: `<article>
    <analogjs-storybook-header
      [user]="user"
      (logout)="doLogout()"
      (login)="doLogin()"
      (createAccount)="doCreateAccount()"
    ></analogjs-storybook-header>
    <section class="storybook-page">
      <h2>Pages in Storybook</h2>
      <p>
        We recommend building UIs with a
        <a
          href="https://componentdriven.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          <strong>component-driven</strong>
        </a>
        process starting with atomic components and ending with pages.
      </p>
      <p>
        Render pages with mock data. This makes it easy to build and review page
        states without needing to navigate to them in your app. Here are some
        handy patterns for managing page data in Storybook:
      </p>
      <ul>
        <li>
          Use a higher-level connected component. Storybook helps you compose
          such data from the "args" of child component stories
        </li>
        <li>
          Assemble data in the page component from your services. You can mock
          these services out using Storybook.
        </li>
      </ul>
      <p>
        Get a guided tutorial on component-driven development at
        <a
          href="https://storybook.js.org/tutorials/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Storybook tutorials
        </a>
        . Read more in the
        <a
          href="https://storybook.js.org/docs"
          target="_blank"
          rel="noopener noreferrer"
        >
          docs
        </a>
        .
      </p>
      <div class="tip-wrapper">
        <span class="tip">Tip</span> Adjust the width of the canvas with the
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g fill="none" fillRule="evenodd">
            <path
              d="M1.5 5.2h4.8c.3 0 .5.2.5.4v5.1c-.1.2-.3.3-.4.3H1.4a.5.5 0 01-.5-.4V5.7c0-.3.2-.5.5-.5zm0-2.1h6.9c.3 0 .5.2.5.4v7a.5.5 0 01-1 0V4H1.5a.5.5 0 010-1zm0-2.1h9c.3 0 .5.2.5.4v9.1a.5.5 0 01-1 0V2H1.5a.5.5 0 010-1zm4.3 5.2H2V10h3.8V6.2z"
              id="a"
              fill="#999"
            />
          </g>
        </svg>
        Viewports addon in the toolbar
      </div>
    </section>
  </article>`,
  styles: [
    `
      .storybook-page {
        font-family:
          'Nunito Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 24px;
        padding: 48px 20px;
        margin: 0 auto;
        max-width: 600px;
        color: #333;
      }

      .storybook-page h2 {
        font-weight: 700;
        font-size: 32px;
        line-height: 1;
        margin: 0 0 4px;
        display: inline-block;
        vertical-align: top;
      }

      .storybook-page p {
        margin: 1em 0;
      }

      .storybook-page a {
        text-decoration: none;
        color: #1ea7fd;
      }

      .storybook-page ul {
        padding-left: 30px;
        margin: 1em 0;
      }

      .storybook-page li {
        margin-bottom: 8px;
      }

      .storybook-page .tip {
        display: inline-block;
        border-radius: 1em;
        font-size: 11px;
        line-height: 12px;
        font-weight: 700;
        background: #e7fdd8;
        color: #66bf3c;
        padding: 4px 12px;
        margin-right: 10px;
        vertical-align: top;
      }

      .storybook-page .tip-wrapper {
        font-size: 13px;
        line-height: 20px;
        margin-top: 40px;
        margin-bottom: 40px;
      }

      .storybook-page .tip-wrapper svg {
        display: inline-block;
        height: 12px;
        width: 12px;
        margin-right: 4px;
        vertical-align: top;
        margin-top: 3px;
      }

      .storybook-page .tip-wrapper svg path {
        fill: #1ea7fd;
      }
    `,
  ],
})
export class PageComponent {
  user: User | null = null;

  doLogout() {
    this.user = null;
  }

  doLogin() {
    this.user = { name: 'Jane Doe' };
  }

  doCreateAccount() {
    this.user = { name: 'Jane Doe' };
  }
}
