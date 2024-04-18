import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  Input,
  NgZone,
  OnChanges,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Data } from '@angular/router';
import { Observable, from, of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';

import { AnchorNavigationDirective } from './anchor-navigation.directive';
import { ContentRenderer } from './content-renderer';
import { MERMAID_IMPORT_TOKEN } from './markdown-content-renderer.service';

@Component({
  selector: 'analog-markdown',
  standalone: true,
  imports: [AsyncPipe],
  hostDirectives: [AnchorNavigationDirective],
  preserveWhitespaces: true,
  encapsulation: ViewEncapsulation.None,
  template: `<div
    #container
    [innerHTML]="content$ | async"
    [class]="classes"
  ></div>`,
})
export default class AnalogMarkdownComponent
  implements OnInit, OnChanges, AfterViewChecked
{
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  private zone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly mermaidImport = inject(MERMAID_IMPORT_TOKEN, {
    optional: true,
  });
  private mermaid: typeof import('mermaid') | undefined;

  public content$: Observable<SafeHtml> = this.getContentSource();

  @Input() content!: string | object | undefined | null;
  @Input() classes = 'analog-markdown';

  @ViewChild('container', { static: true, read: ViewContainerRef })
  container!: ViewContainerRef;

  contentRenderer = inject(ContentRenderer);

  constructor() {
    if (isPlatformBrowser(this.platformId) && this.mermaidImport) {
      // Mermaid can only be loaded on client side
      this.loadMermaid(this.mermaidImport);
    }
  }

  ngOnInit(): void {
    this.updateContent();
  }

  ngOnChanges(): void {
    this.updateContent();
  }

  updateContent() {
    if (this.content && typeof this.content !== 'string') {
      this.container.clear();
      const componentRef = this.container.createComponent(this.content as any);
      componentRef.changeDetectorRef.detectChanges();
    } else {
      this.content$ = this.getContentSource();
    }
  }

  getContentSource() {
    return this.route.data.pipe(
      map<Data, string>((data) => this.content ?? data['_analogContent']),
      mergeMap((contentString) => this.renderContent(contentString)),
      map((content) => this.sanitizer.bypassSecurityTrustHtml(content)),
      catchError((e) => of(`There was an error ${e}`))
    );
  }

  async renderContent(content: string): Promise<string> {
    return this.contentRenderer.render(content);
  }

  ngAfterViewChecked() {
    this.contentRenderer.enhance();
    this.zone.runOutsideAngular(() => this.mermaid?.default.run());
  }

  private loadMermaid(mermaidImport: Promise<typeof import('mermaid')>) {
    this.zone.runOutsideAngular(() =>
      // Wrap into an observable to avoid redundant initialization once
      // the markdown component is destroyed before the promise is resolved.
      from(mermaidImport)
        .pipe(takeUntilDestroyed())
        .subscribe((mermaid) => {
          this.mermaid = mermaid;
          this.mermaid.default.initialize({ startOnLoad: false });
          // Explicitly running mermaid as ngAfterViewChecked
          // has probably already been called
          this.mermaid?.default.run();
        })
    );
  }
}
