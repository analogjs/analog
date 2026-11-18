import { computed, input } from '@angular/core';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// No `PriceMeta`, so the selector is the component name: `<Price>`.
export function Price() @{
  const amount = input.required<number>();
  const formatted = computed(() => currency.format(amount()));

  <span class="price">{formatted()}</span>
}
