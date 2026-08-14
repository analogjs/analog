import { ChangeDetectionStrategy, Component } from '@angular/core';

import { TailwindDebugShellComponent } from '../probes/tailwind-debug-shell.component';

@Component({
  selector: 'app-tailwind-debug-probe-page',
  standalone: true,
  imports: [TailwindDebugShellComponent],
  template: ` <app-tailwind-debug-shell /> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProbePageComponent {}
