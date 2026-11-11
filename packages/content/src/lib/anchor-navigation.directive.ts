import { Directive, HostListener, inject } from '@angular/core';
import { DOCUMENT, Location } from '@angular/common';
import { Router } from '@angular/router';

@Directive({
  selector: '[analogAnchorNavigation]',
  standalone: true,
})
export class AnchorNavigationDirective {
  private readonly document = inject(DOCUMENT);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  @HostListener('click', ['$event.target', '$event'])
  handleNavigation(target: EventTarget | null, event?: MouseEvent): boolean {
    if (event && shouldSkipClick(event)) {
      return true;
    }

    const element = target instanceof Element ? target.closest('a') : null;
    if (
      element &&
      isInternalUrl(element, this.document) &&
      hasTargetSelf(element) &&
      !hasDownloadAttribute(element)
    ) {
      const { pathname, search, hash } = element;
      // A `<base>` element makes the browser resolve fragment-only hrefs
      // (e.g. `href="#some-id"`) against the base URL rather than the
      // current document, so `pathname`/`search` come back as the base's
      // rather than the current page's. Fall back to the document's own
      // location in that case, or an in-page anchor link would navigate
      // to the base route and lose the fragment there.
      const isFragmentOnly = element.getAttribute('href')?.startsWith('#');
      const resolvedPathname = isFragmentOnly
        ? this.document.location.pathname
        : pathname;
      const resolvedSearch = isFragmentOnly
        ? this.document.location.search
        : search;
      const url = this.location.normalize(
        `${resolvedPathname}${resolvedSearch}${hash}`,
      );
      this.router.navigateByUrl(url);

      return false;
    }

    return true;
  }
}

function shouldSkipClick(event: MouseEvent): boolean {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  );
}

function hasDownloadAttribute(anchorElement: HTMLAnchorElement): boolean {
  return anchorElement.getAttribute('download') !== null;
}

function hasTargetSelf(anchorElement: HTMLAnchorElement): boolean {
  return !anchorElement.target || anchorElement.target === '_self';
}

function isInternalUrl(
  anchorElement: HTMLAnchorElement,
  document: Document,
): boolean {
  return (
    anchorElement.host === document.location.host &&
    anchorElement.protocol === document.location.protocol
  );
}
