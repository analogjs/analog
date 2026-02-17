import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'lib-greetings',
  template: `Hello, world!`,
})
export class Greetings {}
