import { injectContent, MarkdownComponent } from '@analogjs/router';
import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'blog-post',
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe],
  template: ` <analog-content [content]="content$ | async"></analog-content> `,
})
export default class BlogPostComponent {
  content$ = injectContent();
}
