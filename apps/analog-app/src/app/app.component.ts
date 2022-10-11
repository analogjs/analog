import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { TopBarComponent } from './top-bar/top-bar.component';

@Component({
  selector: 'analogjs-root',
  standalone: true,
  imports: [TopBarComponent, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {}
