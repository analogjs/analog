import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** An ordinary `.ts` component, so TSRX markup projects into it too. */
@Component({
  selector: 'demo-panel',
  template: `
    <section class="panel">
      <h3>{{ heading() }}</h3>
      <ng-content />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Panel {
  readonly heading = input.required<string>();
}
