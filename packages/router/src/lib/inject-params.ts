/**
 * Type-safe route parameter injection.
 *
 * Provides a Signal-based API for consuming route parameters with full type safety.
 */

import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/**
 * Injects typed route parameters as a Signal.
 *
 * Use the route path as a type parameter to get fully typed parameters.
 * The returned Signal updates reactively when route parameters change.
 *
 * @example
 * // In a page component: /products/[productId].page.ts
 * @Component({
 *   template: `<h1>Product {{ params().productId }}</h1>`
 * })
 * export default class ProductPage {
 *   params = injectParams<'/products/[productId]'>();
 *   // Type: Signal<{ productId: string }>
 * }
 *
 * @example
 * // Multiple parameters: /users/[userId]/posts/[postId].page.ts
 * @Component({
 *   template: `
 *     <h1>User {{ params().userId }}</h1>
 *     <h2>Post {{ params().postId }}</h2>
 *   `
 * })
 * export default class PostPage {
 *   params = injectParams<'/users/[userId]/posts/[postId]'>();
 *   // Type: Signal<{ userId: string; postId: string }>
 * }
 *
 * @returns Signal containing the typed route parameters
 */
export function injectParams<
  T extends Record<string, string> = Record<string, string>,
>(): Signal<T> {
  const activatedRoute = inject(ActivatedRoute);

  return toSignal(
    activatedRoute.paramMap.pipe(
      map((paramMap) => {
        const params: Record<string, string> = {};
        for (const key of paramMap.keys) {
          params[key] = paramMap.get(key) ?? '';
        }
        return params as T;
      }),
    ),
    { requireSync: true },
  );
}
