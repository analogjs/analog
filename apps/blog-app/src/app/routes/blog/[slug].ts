import { injectContent, MarkdownComponent } from '@analogjs/router';
import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'blog-post',
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe],
  template: `
    <analog-markdown [content]="content$ | async"></analog-markdown>
  `,
})
export default class BlogPostComponent {
  content$ = injectContent();
}
