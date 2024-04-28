import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app ngSkipHydration>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
  styles: [],
})
export class AppComponent {}
