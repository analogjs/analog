import { InjectionToken, Type, Provider } from '@angular/core';

/**
 * Registry mapping MDC component names to lazy-loaded Angular components.
 *
 * @experimental MDC component support is experimental and may change in future releases.
 */
export const MDC_COMPONENTS: InjectionToken<
  Map<string, () => Promise<Type<unknown>>>
> = new InjectionToken('mdc_components');

/**
 * Provides a registry of Angular components that can be used in MDC
 * (Markdown Components) syntax within markdown content.
 *
 * @experimental MDC component support is experimental and may change in future releases.
 *
 * @example
 * ```typescript
 * provideContent(
 *   withMd4xRenderer(),
 *   withMdcComponents({
 *     alert: () => import('./components/alert.component'),
 *     card: () => import('./components/card.component'),
 *   }),
 * );
 * ```
 */
export function withMdcComponents(
  components: Record<string, () => Promise<Type<unknown>>>,
): Provider {
  return {
    provide: MDC_COMPONENTS,
    useValue: new Map(Object.entries(components)),
  };
}
