/**
 * Route-data key under `ActivatedRoute.data['load']` that holds the
 * `DehydratedState` produced by `definePageLoadQueries`. The Router-
 * events hydrator in `provideAnalogQuery()` looks for this key on
 * `ResolveEnd` and merges the dehydrated payload into the active
 * `QueryClient`, so component-issued queries hit a warm cache on
 * first render.
 */
export const ANALOG_QUERIES_KEY: '__analogQueries' = '__analogQueries';
