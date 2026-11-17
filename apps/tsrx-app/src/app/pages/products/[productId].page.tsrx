import { injectLoadData } from '@analogjs/router';
import { computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Price } from '../../components/price.tsrx';
import type { load } from './[productId].server';

export default function ProductPage() @{
  const data = toSignal(injectLoadData<typeof load>(), { requireSync: true });
  const product = computed(() => data().product);

  <article>
    @if (product()) {
      <>
        <h2 id="product-name">{product()!.name}</h2>
        <p id="product-description">{product()!.description}</p>
        <Price amount={product()!.price} />
      </>
    } @else {
      <p id="product-missing">{'Product not found.'}</p>
    }
    <p>
      <a use={[RouterLink]} routerLink="/products">{'Back to all products'}</a>
    </p>
  </article>
}
