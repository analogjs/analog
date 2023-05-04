import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBarComponent } from '@analogjs/top-bar';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'analogjs-root',
  standalone: true,
  imports: [TopBarComponent, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  constructor(http: HttpClient) {}
}
