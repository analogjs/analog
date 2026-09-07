import {
  Component,
  PLATFORM_ID,
  TransferState,
  inject,
  makeStateKey,
  resource,
} from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { delayedValue, PROBE_ID } from './probe';

@Component({
  selector: 'fixture-slow',
  standalone: true,
  template: '<p data-slow>{{ data.value() }}</p>',
})
export class SlowPanel {
  private readonly id = inject(PROBE_ID);
  private readonly state = inject(TransferState);
  private readonly server = isPlatformServer(inject(PLATFORM_ID));
  readonly data = resource({
    loader: async ({ abortSignal }) => {
      const key = makeStateKey<string>(`fixture:${this.id}`);
      if (this.state.hasKey(key)) {
        const value = this.state.get(key, '');
        this.state.remove(key);
        return value;
      }
      const value = await delayedValue(this.id, abortSignal);
      if (this.server) this.state.set(key, value);
      return value;
    },
  });
}
