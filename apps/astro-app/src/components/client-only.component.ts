import { Component } from '@angular/core';

@Component({
  selector: 'astro-client-only',
  template: `<p>This component is only rendered on the client.</p>`,
})
export class ClientOnlyComponent {}
