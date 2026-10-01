import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'astro-content-projection-test',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      border: 1px solid black;
      padding: 16px;
    }

    .card__header {
      font-weight: bold;
    }
  `,
  template: `
    <h3>{{ title() }}</h3>
    <div class="card__header"><ng-content select="[question]" /></div>
    <div class="card__body"><ng-content>No content projected</ng-content></div>
  `,
})
export class ContentProjectionTestComponent {
  title = input('Content projection');
}
