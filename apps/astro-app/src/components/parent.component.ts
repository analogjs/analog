import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CardComponent } from './card.component';
import { DeferredComponent } from './deferred.component';

@Component({
  selector: 'astro-parent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, DeferredComponent],
  styles: `
    p {
      margin: 8px 0;
    }
  `,
  template: `
    <p>Verifies that nesting components works properly</p>
    <astro-card
      href="https://angular.dev/"
      title="Angular"
      body="Built with Angular. ❤️"
      (output)="handleClick($event)"
    />

    @defer {
      <astro-deferred />
    } @placeholder {
      <p>Loading deferred component...</p>
    }
  `,
})
export class ParentComponent {
  handleClick(value: string): void {
    console.log(value);
  }
}
