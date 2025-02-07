import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ServerOnly } from '@analogjs/router';

@Component({
  imports: [ServerOnly],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Client Component</h2>

    <ServerOnly component="hello" [props]="props()" (outputs)="log($event)" />

    <ServerOnly component="hello" [props]="props2()" (outputs)="log($event)" />

    <p>
      <button (click)="update()">Update</button>
    </p>
  `,
})
export default class ClientComponent {
  props = signal({ name: 'Brandon', count: 0 });
  props2 = signal({ name: 'Brandon', count: 4 });

  update() {
    this.props.update((data) => ({ ...data, count: ++data.count }));
  }

  log($event: object) {
    console.log({ outputs: $event });
  }
}
