import { DOCUMENT, inject } from '@angular/core';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { NavigationEnd, Router } from '@angular/router';
import { isPlainObject } from 'es-toolkit';
import { filter } from 'rxjs/operators';

import type { Graph, Thing, WithContext } from 'schema-dts';

export type JsonLdObject = Record<string, unknown>;

export function isJsonLdObject(value: unknown): value is JsonLdObject {
  return isPlainObject(value);
}

export function normalizeJsonLd(value: unknown): JsonLdObject[] {
  if (Array.isArray(value)) {
    return value.filter(isJsonLdObject);
  }

  return isJsonLdObject(value) ? [value] : [];
}

export type JsonLd = JsonLdObject | JsonLdObject[];

/**
 * Typed JSON-LD document based on `schema-dts`.
 *
 * Accepts single Schema.org nodes (`WithContext<Thing>`),
 * `@graph`-based documents (`Graph`), or arrays of nodes.
 *
 * This is the canonical JSON-LD type for route authoring surfaces
 * (`routeMeta.jsonLd`, `routeJsonLd`, generated manifest).
 *
 * @example
 * ```ts
 * import type { WebPage, WithContext } from 'schema-dts';
 *
 * export const routeMeta = {
 *   jsonLd: {
 *     '@context': 'https://schema.org',
 *     '@type': 'WebPage',
 *     name: 'Products',
 *   } satisfies WithContext<WebPage>,
 * };
 * ```
 */
export type AnalogJsonLdDocument =
  | WithContext<Thing>
  | Graph
  | WithContext<Thing>[];

export const ROUTE_JSON_LD_KEY: unique symbol = Symbol(
  '@analogjs/router Route JSON-LD Key',
);
const JSON_LD_SCRIPT_SELECTOR = 'script[data-analog-json-ld]';

export function updateJsonLdOnRouteChange(
  router: Router = inject(Router),
  document: Document | null = inject(DOCUMENT, { optional: true }),
): void {
  if (!document) {
    return;
  }

  router.events
    .pipe(filter((event) => event instanceof NavigationEnd))
    .subscribe(() => {
      const entries = getJsonLdEntries(router.routerState.snapshot.root);
      applyJsonLdToDocument(document, entries);
    });
}

export function serializeJsonLd(entry: JsonLdObject): string | null {
  try {
    return JSON.stringify(entry)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  } catch {
    return null;
  }
}

function getJsonLdEntries(route: ActivatedRouteSnapshot): JsonLdObject[] {
  const entries: JsonLdObject[] = [];
  let currentRoute: ActivatedRouteSnapshot | null = route;

  while (currentRoute) {
    entries.push(...normalizeJsonLd(currentRoute.data[ROUTE_JSON_LD_KEY]));
    currentRoute = currentRoute.firstChild;
  }

  return entries;
}

function applyJsonLdToDocument(
  document: Document,
  entries: JsonLdObject[],
): void {
  document.querySelectorAll(JSON_LD_SCRIPT_SELECTOR).forEach((element) => {
    element.remove();
  });

  if (entries.length === 0) {
    return;
  }

  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) {
    return;
  }

  entries.forEach((entry, index) => {
    const serialized = serializeJsonLd(entry);
    if (!serialized) {
      return;
    }

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-analog-json-ld', 'true');
    script.setAttribute('data-analog-json-ld-index', String(index));
    script.textContent = serialized;
    head.appendChild(script);
  });
}
