import { Component, inject, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Data } from '@angular/router';
import { marked } from 'marked';
import { catchError, filter, map, Observable, of, switchMap } from 'rxjs';

@Component({
  selector: 'analog-content',
  standalone: true,
  preserveWhitespaces: true,
  encapsulation: ViewEncapsulation.None,
  template: `<div [innerHTML]="content" class="analog-content"></div>`,
})
export default class AnalogMarkdownComponent {
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  protected content: Observable<SafeHtml> = of('');

  ngOnInit() {
    this.content = this.route.data.pipe(
      map<Data, () => Promise<string>>((data) => data['_analogContent']),
      filter((resolver) => !!resolver && typeof resolver === 'function'),
      switchMap((res) => res()),
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
