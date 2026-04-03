import { Component } from '@angular/core';

@Component({
  selector: 'astro-deferred',
  // host: {
  //   '(click)': 'handleClick()'
  // },
  template: `<p (click)="handleClick()">Deferred works</p>`,
})
export class DeferredComponent {
  handleClick(): void {
    console.log('clicked deferred component');
  }
}
