import { inject } from '@angular/core';
import { Meta, MetaDefinition as NgMetaTag } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export const ROUTE_META_TAGS_KEY: unique symbol = Symbol(
  '@analogjs/router Route Meta Tags Key',
);

const CHARSET_KEY = 'charset';
const HTTP_EQUIV_KEY = 'httpEquiv';
// httpEquiv selector key needs to be in kebab case format
const HTTP_EQUIV_SELECTOR_KEY = 'http-equiv';
const NAME_KEY = 'name';
const PROPERTY_KEY = 'property';
const CONTENT_KEY = 'content';
const ITEMPROP_KEY = 'itemprop';
const ROUTE_META_ATTR = 'data-analog-route-meta';

export type MetaTag =
  | (CharsetMetaTag & ExcludeRestMetaTagKeys<typeof CHARSET_KEY>)
  | (HttpEquivMetaTag & ExcludeRestMetaTagKeys<typeof HTTP_EQUIV_KEY>)
  | (NameMetaTag & ExcludeRestMetaTagKeys<typeof NAME_KEY>)
  | (PropertyMetaTag & ExcludeRestMetaTagKeys<typeof PROPERTY_KEY>)
  | (ItempropMetaTag & ExcludeRestMetaTagKeys<typeof ITEMPROP_KEY>);

type CharsetMetaTag = { [CHARSET_KEY]: string };
type HttpEquivMetaTag = { [HTTP_EQUIV_KEY]: string; [CONTENT_KEY]: string };
type NameMetaTag = { [NAME_KEY]: string; [CONTENT_KEY]: string };
type PropertyMetaTag = { [PROPERTY_KEY]: string; [CONTENT_KEY]: string };
type ItempropMetaTag = { [ITEMPROP_KEY]: string; [CONTENT_KEY]: string };

type MetaTagKey =
  | typeof CHARSET_KEY
  | typeof HTTP_EQUIV_KEY
  | typeof NAME_KEY
  | typeof PROPERTY_KEY
  | typeof ITEMPROP_KEY;
type ExcludeRestMetaTagKeys<Key extends MetaTagKey> = {
  [K in Exclude<MetaTagKey, Key>]?: never;
};

type MetaTagSelector =
  | typeof CHARSET_KEY
  | `${
      | typeof HTTP_EQUIV_SELECTOR_KEY
      | typeof NAME_KEY
      | typeof PROPERTY_KEY
      | typeof ITEMPROP_KEY}="${string}"`;
type MetaTagMap = Record<MetaTagSelector, MetaTag>;

export function updateMetaTagsOnRouteChange(
  router: Router = inject(Router),
  metaService: Meta = inject(Meta),
): void {
  router.events
    .pipe(filter((event) => event instanceof NavigationEnd))
    .subscribe(() => {
      const metaTagMap = getMetaTagMap(router.routerState.snapshot.root);
      const metaTagSelectors = Object.keys(metaTagMap);

      for (const ownedTag of metaService.getTags(ROUTE_META_ATTR)) {
        if (
          !metaTagSelectors.some((selector) =>
            ownedTag.matches(`meta[${selector}]`),
          )
        ) {
          releaseMetaTag(ownedTag, metaService);
        }
      }

      for (const metaTagSelector in metaTagMap) {
        const existingTag = metaService.getTag(metaTagSelector);
        const originalAttributes =
          existingTag?.getAttribute(ROUTE_META_ATTR) ??
          serializeAttributes(existingTag);
        const metaTag = metaTagMap[
          metaTagSelector as MetaTagSelector
        ] as NgMetaTag;
        metaService
          .updateTag(metaTag, metaTagSelector)
          ?.setAttribute(ROUTE_META_ATTR, originalAttributes);
      }
    });
}

function serializeAttributes(tag: HTMLMetaElement | null): string {
  if (!tag) {
    return '';
  }

  return JSON.stringify(
    Object.fromEntries(
      tag.getAttributeNames().map((name) => [name, tag.getAttribute(name)]),
    ),
  );
}

function releaseMetaTag(tag: HTMLMetaElement, metaService: Meta): void {
  const originalAttributes = tag.getAttribute(ROUTE_META_ATTR);
  if (!originalAttributes) {
    metaService.removeTagElement(tag);
    return;
  }

  for (const name of tag.getAttributeNames()) {
    tag.removeAttribute(name);
  }
  const attributes: Record<string, string> = JSON.parse(originalAttributes);
  for (const [name, value] of Object.entries(attributes)) {
    tag.setAttribute(name, value);
  }
}

function getMetaTagMap(route: ActivatedRouteSnapshot): MetaTagMap {
  const metaTagMap = {} as MetaTagMap;
  let currentRoute: ActivatedRouteSnapshot | null = route;

  while (currentRoute) {
    const metaTags: MetaTag[] = currentRoute.data[ROUTE_META_TAGS_KEY] ?? [];
    for (const metaTag of metaTags) {
      metaTagMap[getMetaTagSelector(metaTag)] = metaTag;
    }

    currentRoute = currentRoute.firstChild;
  }

  return metaTagMap;
}

function getMetaTagSelector(metaTag: MetaTag): MetaTagSelector {
  if (metaTag.name) {
    return `${NAME_KEY}="${metaTag.name}"`;
  }

  if (metaTag.property) {
    return `${PROPERTY_KEY}="${metaTag.property}"`;
  }

  if (metaTag.httpEquiv) {
    return `${HTTP_EQUIV_SELECTOR_KEY}="${metaTag.httpEquiv}"`;
  }

  if (metaTag.itemprop) {
    return `${ITEMPROP_KEY}="${metaTag.itemprop}"`;
  }

  return CHARSET_KEY;
}
