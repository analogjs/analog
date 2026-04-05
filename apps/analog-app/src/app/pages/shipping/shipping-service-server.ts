import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class ShippingService {
  private readonly http = inject(HttpClient);

  getShippingPrices() {
    console.log('on server');
    return this.http.get<{ type: string; price: number }[]>(
      '/assets/shipping.json',
    );
  }
}
