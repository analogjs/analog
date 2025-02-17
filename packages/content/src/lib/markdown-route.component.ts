import { AsyncPipe } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  inject,
  Input,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';

import { ContentRenderer } from './content-renderer';
import { AnchorNavigationDirective } from './anchor-navigation.directive';

@Component({
  selector: 'analog-markdown-route',
  standalone: true,
  imports: [AsyncPipe],
  hostDirectives: [AnchorNavigationDirective],
  preserveWhitespaces: true,
  encapsulation: ViewEncapsulation.None,
  template: `<div [innerHTML]="content" [class]="classes"></div>`,
})
export default class AnalogMarkdownRouteComponent implements AfterViewChecked {
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  contentRenderer = inject(ContentRenderer);

  protected content: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(
    this.route.snapshot.data['renderedAnalogContent'],
  );

  @Input() classes = 'analog-markdown-route';

  ngAfterViewChecked() {
    this.contentRenderer.enhance();
  }
}
