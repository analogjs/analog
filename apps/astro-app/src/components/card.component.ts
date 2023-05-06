import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  ViewEncapsulation,
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { HttpClient, provideHttpClient } from '@angular/common/http';

@Component({
  selector: 'astro-card',
  standalone: true,
  template: `
    <li class="link-card">
      <a [href]="href">
        <h2>
          {{ title }}
          <span>&rarr;</span>
        </h2>
        <p>
          {{ body }}
        </p>
      </a>
    </li>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: [
    `
      :root {
        --link-gradient: linear-gradient(
          45deg,
          #4f39fa,
          #da62c4 30%,
          var(--color-border) 60%
        );
      }

      .link-card {
        list-style: none;
        display: flex;
        padding: 0.15rem;
        background-image: var(--link-gradient);
        background-size: 400%;
        border-radius: 0.5rem;
        background-position: 100%;
        transition: background-position 0.6s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .link-card > a {
        width: 100%;
        text-decoration: none;
        line-height: 1.4;
        padding: 1em 1.3em;
        border-radius: 0.35rem;
        color: var(--text-color);
        background-color: white;
        opacity: 0.8;
      }

      h2 {
        margin: 0;
        transition: color 0.6s cubic-bezier(0.22, 1, 0.36, 1);
      }

      p {
        margin-top: 0.75rem;
        margin-bottom: 0;
      }

      h2 span {
        display: inline-block;
        transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .link-card:is(:hover, :focus-within) {
        background-position: 0;
      }

      .link-card:is(:hover, :focus-within) h2 {
        color: #4f39fa;
      }

      .link-card:is(:hover, :focus-within) h2 span {
        will-change: transform;
        transform: translateX(2px);
      }
    `,
  ],
})
export class CardComponent {
  @Input() href = '';
  @Input() title = '';
  @Input() body = '';

  static renderProviders = [provideHttpClient()];
  static clientProviders = [CardComponent.renderProviders, provideAnimations()];

  private _http = inject(HttpClient);
}
