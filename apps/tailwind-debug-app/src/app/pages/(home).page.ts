import { Component } from '@angular/core';

import { TailwindDebugShellComponent } from '../probes/tailwind-debug-shell.component';

@Component({
  selector: 'app-tailwind-debug-home',
  imports: [TailwindDebugShellComponent],
  template: ` <app-tailwind-debug-shell /> `,
})
export default class HomeComponent {}
