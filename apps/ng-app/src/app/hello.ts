import { Component } from '@angular/core';
import Hello from './hello.ag';

@Component({
  selector: 'app-hello-original',
  standalone: true,
  template: `
    <p>I'm a boring hello</p>
    <p>Below me is a cool hello though</p>
    <Hello text="this is from the boring HelloOriginal" />
  `,
  styles: `
    p {
      color: teal;
    }
  `,
  imports: [Hello],
})
// eslint-disable-next-line @angular-eslint/component-class-suffix
export class HelloOriginal {}
