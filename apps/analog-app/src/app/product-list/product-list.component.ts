import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ProductAlertsComponent } from '../product-alerts/product-alerts.component';

import { products } from '../products';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, ProductAlertsComponent, RouterModule],
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.css']
})
export class ProductListComponent {

  products = [...products];

  share() {
    window.alert('The product has been shared!');
  }

  onNotify() {
    window.alert('You will be notified when the product goes on sale');
  }
}


