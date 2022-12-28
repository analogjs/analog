import { AsyncPipe } from '@angular/common';
import { Component, inject, Input, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Data } from '@angular/router';
import { marked } from 'marked';
import { catchError, map, Observable, of, switchMap } from 'rxjs';

@Component({
  selector: 'analog-markdown',
  imports: [AsyncPipe],
  standalone: true,
  preserveWhitespaces: true,
  encapsulation: ViewEncapsulation.None,
  template: `<div [innerHTML]="content$ | async" [class]="classes"></div>`,
})
export default class AnalogMarkdownComponent {
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  public content$: Observable<SafeHtml> = of('');

  @Input() content!: string | null;
  @Input() classes = 'analog-markdown';

  ngOnInit() {
    this.content$ = this.route.data.pipe(
      map<Data, () => Promise<string>>((data) => data['_analogContent']),
      switchMap((contentResolver) =>
        this.content ? of(this.content) : contentResolver()
      ),
      map((contentString) =>
        this.sanitizer.bypassSecurityTrustHtml(
          this.renderContent(contentString)
        )
      ),
      catchError((e) => of(`There was an error ${e}`))
    );
  }

  renderContent(content: string): string {
    const rendered = marked.parse(content);
    return rendered;
  }
}
