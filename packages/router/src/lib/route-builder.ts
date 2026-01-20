/**
 * Base type for typed routes.
 * This type is overridden by routes.d.ts when generated.
 * The generated file provides the actual route union type.
 */
export type TypedRoute = string;

/**
 * Type-safe route builder function.
 *
 * Builds a route path string from a typed path and optional parameters.
 * Use with Angular's routerLink directive for type-safe navigation.
 *
 * **Important**: This function requires `routes.d.ts` to be generated for
 * type safety. Run `npm run dev` or `npm run build` to generate it.
 *
 * @example
 * // Static route
 * route('/about')  // Returns: '/about'
 *
 * // Dynamic route
 * route('/products/[productId]', { productId: '123' })  // Returns: '/products/123'
 *
 * // Catch-all route
 * route('/[...slug]', { slug: 'some/nested/path' })  // Returns: '/some/nested/path'
 *
 * @example
 * // In template with routerLink
 * <a [routerLink]="route('/products/[productId]', { productId: product.id })">
 *   {{ product.name }}
 * </a>
 *
 * @param path - The route path (static or with parameters)
 * @param params - Parameters for dynamic routes
 * @returns The resolved path string
 */
export function route<T extends string = string>(
  path: T,
  params?: Record<string, string | number>,
): string {
  if (!params) {
    return path as string;
  }

  let result = path as string;
  for (const [key, value] of Object.entries(params)) {
    // Handle catch-all [...param] first
    result = result
      .replace(`[...${key}]`, String(value))
      .replace(`[${key}]`, String(value));
  }

  return result;
}
