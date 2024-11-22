import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  template: ` <router-outlet /> `,
})
export default class AuthLayoutPageComponent {}
