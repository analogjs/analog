import { Component } from '@angular/core';
import { NxWelcomeComponent } from './nx-welcome.component';

@Component({
  selector: 'analogjs-root',
  standalone: true,
  imports: [NxWelcomeComponent],
  template: `
    <analogjs-nx-welcome></analogjs-nx-welcome>
  `,
  styles: [``],
})
export class AppComponent {
  title = 'analog-app';
}
