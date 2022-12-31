/**
 * Credit goes to Scully for original implementation
 * https://scully.io/docs/Reference/utilities/prism-js/
 */
import { AsyncPipe } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  inject,
  Input,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Data } from '@angular/router';
import { catchError, map, mergeMap, Observable, of, switchMap } from 'rxjs';
import { ContentRenderer } from './content-renderer';

@Component({
  selector: 'analog-markdown',
  imports: [AsyncPipe],
  standalone: true,
  preserveWhitespaces: true,
  encapsulation: ViewEncapsulation.None,
  template: `<div [innerHTML]="content$ | async" [class]="classes"></div>`,
})
export default class AnalogMarkdownComponent
  implements OnInit, AfterViewChecked
{
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  public content$: Observable<SafeHtml> = of('');

  @Input() content!: string | null;
  @Input() classes = 'analog-markdown';

  contentRenderer = inject(ContentRenderer);

  ngOnInit() {
    this.content$ = this.route.data.pipe(
      map<Data, () => Promise<string>>((data) => data['_analogContent']),
      switchMap((contentResolver) =>
        this.content ? of(this.content) : contentResolver()
      ),
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
