import { Component } from '@angular/core';

@Component({
  selector: 'docs-footer',
  standalone: true,
  template: `
    <footer class="border-t px-6 py-4 text-sm text-gray-500">
      © 2022–{{ year }} Analog. Licensed under MIT.
    </footer>
  `,
})
export class Footer {
  year = new Date().getFullYear();
}
