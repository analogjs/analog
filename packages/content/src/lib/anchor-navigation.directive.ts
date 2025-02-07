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

  @HostListener('click', ['$event.target'])
  handleNavigation(element: HTMLElement): boolean {
    if (
      element instanceof HTMLAnchorElement &&
      isInternalUrl(element, this.document) &&
      hasTargetSelf(element) &&
      !hasDownloadAttribute(element)
    ) {
      const { pathname, search, hash } = element;
      const url = this.location.normalize(`${pathname}${search}${hash}`);
      this.router.navigateByUrl(url);

      return false;
    }

    return true;
  }
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
