import { Component } from '@angular/core';
import type { WithContext, Product } from 'schema-dts';

// JSON-LD for a product page
export const routeJsonLd: WithContext<Product> = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'AnalogJS Pro License',
  description:
    'Professional license for AnalogJS framework with premium features',
  image: 'https://example.com/analogjs-pro.jpg',
  brand: {
    '@type': 'Brand',
    name: 'AnalogJS',
  },
  offers: {
    '@type': 'Offer',
    price: '99.00',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    seller: {
      '@type': 'Organization',
      name: 'AnalogJS Inc.',
    },
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    reviewCount: '142',
  },
};

@Component({
  selector: 'app-product',
  standalone: true,
  template: `
    <div class="product-page">
      <h1>AnalogJS Pro License</h1>
      <div class="product-info">
        <img src="/analogjs-pro.jpg" alt="AnalogJS Pro" />
        <div class="details">
          <p class="price">$99.00</p>
          <p class="description">
            Professional license for AnalogJS framework with premium features
          </p>
          <div class="rating">⭐⭐⭐⭐⭐ 4.8/5 (142 reviews)</div>
          <button class="buy-button">Buy Now</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .product-page {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
      }

      .product-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
        margin-top: 2rem;
      }

      .price {
        font-size: 2rem;
        font-weight: bold;
        color: #007bff;
      }

      .buy-button {
        background: #28a745;
        color: white;
        border: none;
        padding: 1rem 2rem;
        font-size: 1.2rem;
        border-radius: 4px;
        cursor: pointer;
      }

      .buy-button:hover {
        background: #218838;
      }
    `,
  ],
})
export default class ProductPageComponent {}
