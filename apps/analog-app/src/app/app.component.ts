import { Component } from '@angular/core';
import { CartService } from './cart.service';

@Component({
  selector: 'analogjs-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent { 
  constructor(cs: CartService) {}
}