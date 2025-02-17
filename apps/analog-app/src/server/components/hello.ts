import {
  ChangeDetectionStrategy,
  Component,
  computed,
  OnInit,
} from '@angular/core';

import {
  injectStaticOutputs,
  injectStaticProps,
} from '@analogjs/router/server';

@Component({
  selector: 'app-hello',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Hello From the Server</h3>

    <p>Props: {{ json() }}</p>

    <p>Time: {{ Date.now().toString() }}</p>
  `,
  styles: `
    h3 {
      color: blue;
    }
  `,
})
export default class HelloComponent implements OnInit {
  Date = Date;
  props = injectStaticProps();
  outputs = injectStaticOutputs<{ loaded: boolean }>();
  json = computed(() => JSON.stringify(this.props));

  ngOnInit() {
    this.outputs.set({ loaded: true });
  }
}
