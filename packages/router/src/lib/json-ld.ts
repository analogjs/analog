import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export type JsonLdObject = Record<string, unknown>;
export type JsonLd = JsonLdObject | JsonLdObject[];

export const ROUTE_JSON_LD_KEY = Symbol('@analogjs/router Route JSON-LD Key');
const JSON_LD_SCRIPT_SELECTOR = 'script[data-analog-json-ld]';

export function updateJsonLdOnRouteChange(): void {
  const router = inject(Router);
  const document = inject(DOCUMENT);

  router.events
    .pipe(filter((event) => event instanceof NavigationEnd))
    .subscribe(() => {
      applyJsonLdToDocument(
        document,
        getJsonLdEntries(router.routerState.snapshot.root),
      );
    });
}

export function normalizeJsonLd(value: unknown): JsonLdObject[] {
  if (Array.isArray(value)) {
    return value.filter(isJsonLdObject);
  }

  return isJsonLdObject(value) ? [value] : [];
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
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-analog-json-ld', 'true');
    script.setAttribute('data-analog-json-ld-index', String(index));
    script.textContent = JSON.stringify(entry);
    head.appendChild(script);
  });
}

export function isJsonLdObject(value: unknown): value is JsonLdObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
