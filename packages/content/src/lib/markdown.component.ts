import { AsyncPipe } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  inject,
  Input,
  OnInit,
  OnChanges,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Data } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';

import { ContentRenderer } from './content-renderer';
import { AnchorNavigationDirective } from './anchor-navigation.directive';

@Component({
  selector: 'analog-markdown',
  standalone: true,
  imports: [AsyncPipe],
  hostDirectives: [AnchorNavigationDirective],
  preserveWhitespaces: true,
  encapsulation: ViewEncapsulation.None,
  template: `<div [innerHTML]="content$ | async" [class]="classes"></div>`,
})
export default class AnalogMarkdownComponent
  implements OnInit, OnChanges, AfterViewChecked
{
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  public content$: Observable<SafeHtml> = of('');

  @Input() content!: string | undefined | null;
  @Input() classes = 'analog-markdown';

  contentRenderer = inject(ContentRenderer);

  ngOnInit() {
    this.updateContent();
  }

  ngOnChanges(): void {
    this.updateContent();
  }

  updateContent() {
    this.content$ = this.route.data.pipe(
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
  }
}
