import {
  Directive,
  inject,
  input,
  InputSignal,
  OnChanges,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { AnalogRoutePath } from './to-route';

type SegmentCommands<Segment extends string> =
  Segment extends `[[...${string}]]`
    ? (string | number)[]
    : Segment extends `[...${string}]`
      ? [string | number, ...(string | number)[]]
      : Segment extends `[${string}]`
        ? [string | number]
        : [Segment];

type PathCommands<Path extends string> = Path extends ''
  ? []
  : Path extends `${infer Segment}/${infer Rest}`
    ? [...SegmentCommands<Segment>, ...PathCommands<Rest>]
    : SegmentCommands<Path>;

// Angular can combine leading static segments in the first command.
type AbsoluteCommands<
  Path extends string,
  Prefix extends string = '',
> = Path extends `${infer Segment}/${infer Rest}`
  ? Segment extends `[${string}]`
    ? [Prefix extends '' ? '/' : Prefix, ...PathCommands<Path>]
    :
        | [`${Prefix}/${Segment}`, ...PathCommands<Rest>]
        | AbsoluteCommands<Rest, `${Prefix}/${Segment}`>
  : Path extends `[${string}]`
    ? [Prefix extends '' ? '/' : Prefix, ...SegmentCommands<Path>]
    : [`${Prefix}/${Path}`];

type StaticPath<Path extends string> =
  Path extends `${infer Prefix}/[[...${string}]]`
    ? StaticPath<Prefix extends '' ? '/' : Prefix>
    : Path extends `${string}[${string}`
      ? never
      : Path;

type LinkToCommands = {
  [P in AnalogRoutePath]: P extends `/${infer Path}`
    ?
        | StaticPath<P>
        | Readonly<AbsoluteCommands<Path> | ['/', ...PathCommands<Path>]>
    : never;
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
        'queryParams',
        'fragment',
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
  readonly linkTo: InputSignal<LinkToCommands | null | undefined> =
    input.required<LinkToCommands | null | undefined>();
  private readonly routerLink = inject(RouterLink);

  ngOnChanges(): void {
    this.routerLink.routerLink = this.linkTo();
    // Direct input assignments must also refresh href and RouterLinkActive.
    this.routerLink.ngOnChanges({});
  }
}
