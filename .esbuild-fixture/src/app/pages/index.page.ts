import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `<h1>{{ title() }}</h1>`,
})
export default class HomePage {
  readonly title = signal('Home');
}
