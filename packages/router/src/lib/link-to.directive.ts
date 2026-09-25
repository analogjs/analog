import {
  Directive,
  inject,
  input,
  InputSignal,
  OnChanges,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';

import { observeRouteParams } from './inject-typed-params';
import {
  AnalogRoutePath,
  buildRouteLink,
  resolveScopedRoute,
  ResolveRoutePath,
  RouteParamsOutput,
  RoutePathOptions,
  RoutePathOptionsBase,
  ScopedRoutePathArgs,
  ScopedRoutePathOptions,
  ScopedRouteTarget,
} from './to-route';

type LinkToDestination = {
  [P in AnalogRoutePath]: { path: P } & RoutePathOptions<P>;
}[AnalogRoutePath];

type StaticRoutePath = {
  [P in AnalogRoutePath]: RouteParamsOutput<P> extends Record<string, never>
    ? P
    : never;
}[AnalogRoutePath];

type ScopedDestination<From extends AnalogRoutePath> = {
  [T in ScopedRouteTarget<From>]: { path: T } & ScopedRoutePathOptions<
    From,
    ResolveRoutePath<From, T>
  >;
}[ScopedRouteTarget<From>];

type ScopedStaticTarget<From extends AnalogRoutePath> = {
  [T in ScopedRouteTarget<From>]: [] extends ScopedRoutePathArgs<From, T>
    ? T
    : never;
}[ScopedRouteTarget<From>];

/** Destinations accepted by `[linkTo]`, relative to `From` when provided. */
export type LinkToInput<From extends AnalogRoutePath | undefined = undefined> =
  // Angular infers `any` for `From` when the `from` input is not bound.
  | (unknown extends From
      ? StaticRoutePath | LinkToDestination
      : From extends AnalogRoutePath
        ? ScopedStaticTarget<From> | ScopedDestination<From>
        : StaticRoutePath | LinkToDestination)
  | null
  | undefined;

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
export class LinkTo<From extends AnalogRoutePath | undefined = undefined>
  implements OnChanges, OnDestroy
{
  readonly linkTo: InputSignal<LinkToInput<From>> =
    input.required<LinkToInput<From>>();
  /** The current route's path. Enables relative destinations and param inheritance. */
  readonly from: InputSignal<From | undefined> = input<From>();
  private readonly routerLink = inject(RouterLink);
  private readonly route = inject(ActivatedRoute);
  private currentParams: Record<string, unknown> = {};
  private paramsFrom?: string;
  private paramsSubscription?: Subscription;

  ngOnChanges(): void {
    const from = this.from();
    if (from !== this.paramsFrom) {
      this.paramsFrom = from;
      this.paramsSubscription?.unsubscribe();
      this.paramsSubscription = from
        ? observeRouteParams(this.route, from).subscribe((params) => {
            this.currentParams = params;
            this.update();
          })
        : undefined;
    }
    this.update();
  }

  ngOnDestroy(): void {
    this.paramsSubscription?.unsubscribe();
  }

  private update(): void {
    const destination = this.linkTo() as
      | string
      | ({ path: string } & RoutePathOptionsBase)
      | null
      | undefined;
    const from = this.from();
    let link = null;
    if (destination) {
      const { path, ...options }: { path: string } & RoutePathOptionsBase =
        typeof destination === 'string' ? { path: destination } : destination;
      if (from) {
        const scoped = resolveScopedRoute(
          from,
          path,
          this.currentParams,
          options,
        );
        link = buildRouteLink(scoped.path, scoped.options);
      } else {
        link = buildRouteLink(path, options);
      }
    }

    this.routerLink.routerLink = link?.path ?? null;
    this.routerLink.queryParams = link?.queryParams ?? null;
    this.routerLink.fragment = link?.fragment;
    // Direct input assignments must also refresh href and RouterLinkActive.
    this.routerLink.ngOnChanges({});
  }
}
