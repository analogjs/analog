import type { RouteMeta } from '@analogjs/router';
import { RouterOutlet } from '@angular/router';

export const routeMeta: RouteMeta = { title: 'Products' };

// A layout route: `products.page.tsrx` wraps `products/*.page.tsrx`.
export default function ProductsLayout() @{
  <section class="products">
    <h1>{'Products'}</h1>
    <RouterOutlet />
  </section>
}
