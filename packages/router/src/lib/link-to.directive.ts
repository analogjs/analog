import {
  Directive,
  inject,
  input,
  InputSignal,
  OnChanges,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AnalogRoutePath,
  buildRouteLink,
  RoutePathOptions,
  RoutePathOptionsBase,
} from './to-route';

type LinkToDestination = {
  [P in AnalogRoutePath]: { path: P } & RoutePathOptions<P>;
}[AnalogRoutePath];

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: '[linkTo]',
  standalone: true,
  hostDirectives: [
    {
      directive: RouterLink,
      inputs: [
        'target',
        'queryParamsHandling',
        'preserveFragment',
        'skipLocationChange',
        'replaceUrl',
        'state',
      ],
    },
  ],
})
export class LinkTo implements OnChanges {
  readonly linkTo: InputSignal<LinkToDestination | null | undefined> =
    input.required<LinkToDestination | null | undefined>();
  private readonly routerLink = inject(RouterLink);

  ngOnChanges(): void {
    const destination = this.linkTo() as
      | ({ path: string } & RoutePathOptionsBase)
      | null
      | undefined;
    const link = destination
      ? buildRouteLink(destination.path, destination)
      : null;

    this.routerLink.routerLink = link?.path ?? null;
    this.routerLink.queryParams = link?.queryParams ?? null;
    this.routerLink.fragment = link?.fragment;
    // Direct input assignments must also refresh href and RouterLinkActive.
    this.routerLink.ngOnChanges({});
  }
}
