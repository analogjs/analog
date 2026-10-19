import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import ProductDetailsComponent from './products.[productId].page';

it('updates the displayed product when the typed route parameter changes', () => {
  const params = new BehaviorSubject({ productId: '1' });
  const products = [
    { id: 1, name: 'First phone', price: 100, description: '' },
    { id: 2, name: 'Second phone', price: 200, description: '' },
  ];
  TestBed.configureTestingModule({
    imports: [ProductDetailsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { params, data: of({ load: { products } }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProductDetailsComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('h3').textContent).toBe(
    'First phone',
  );

  params.next({ productId: '2' });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('h3').textContent).toBe(
    'Second phone',
  );
  http.expectOne('/api/v1/products').flush(products);
  http.verify();
});
