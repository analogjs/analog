import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <h1>Our Locations</h1>
    <nav>
      <ul>
        <li>
          <a routerLink="/locations/new-york">New York</a>
        </li>
        <li>
          <a routerLink="/locations/san-francisco">San Francisco</a>
        </li>
      </ul>
    </nav>
    <router-outlet />
  `,
})
export default class LocationsPageComponent {}
