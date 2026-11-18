import { injectLoadData } from '@analogjs/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Price } from '../../components/price.tsrx';
import type { load } from './index.server';

export default function ProductListPage() @{
  const data = toSignal(injectLoadData<typeof load>(), { requireSync: true });

  <ul id="product-list">
    @for (const product of data().products; key product.id) {
      <li>
        <a use={[RouterLink]} routerLink={`/products/${product.id}`}>{product.name}</a>
        {' '}
        <Price amount={product.price} />
      </li>
    } @empty {
      <li>{'No products yet.'}</li>
    }
  </ul>
}
