import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CardComponent } from './card.component';

@Component({
  selector: 'astro-parent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent],
  styles: `
    p {
      margin: 8px 0;
    }
  `,
  template: `
    <p>
      This component verifies that nesting components works properly for style
      encapsulation.
    </p>
    <astro-card
      href="https://angular.dev/"
      title="Angular"
      body="Built with Angular. ❤️"
      (output)="handleClick($event)"
    />
  `,
})
export class ParentComponent {
  handleClick(value: string): void {
    console.log(value);
  }
}
