import {
  Component,
  DOCUMENT,
  ElementRef,
  inject,
  type OnInit,
} from '@angular/core';
import { CounterComponent } from './counter.component';

@Component({
  selector: 'astro-skip-hydration-test',
  imports: [CounterComponent],
  host: {
    ngSkipHydration: 'true',
  },
  styles: `
    :host {
      display: block;
      border: 1px solid black;
      padding: 16px;
    }
  `,
  template: `<astro-counter />`,
})
export class SkipHydrationTestComponent implements OnInit {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  ngOnInit(): void {
    const element = this.document.createElement('div');
    element.innerText = 'This text was created with native DOM APIs';
    this.elementRef.nativeElement.appendChild(element);
  }
}
