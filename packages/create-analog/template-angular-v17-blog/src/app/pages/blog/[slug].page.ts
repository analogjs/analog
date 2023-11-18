import { Component } from '@angular/core';
import { injectContent, MarkdownComponent } from '@analogjs/content';
import { AsyncPipe, NgIf } from '@angular/common';
import PostAttributes from '../../post-attributes';

@Component({
  selector: 'app-blog-post',
  standalone: true,
  imports: [AsyncPipe, NgIf, MarkdownComponent],
  template: `
    <article *ngIf="post$ | async as post">
      <img class="post__image" [src]="post.attributes.coverImage" />
      <analog-markdown [content]="post.content" />
    </article>
  `,
  styles: [
    `
      .post__image {
        max-height: 40vh;
      }
    `,
  ],
})
export default class HomeComponent {
  readonly post$ = injectContent<PostAttributes>('slug');
}
