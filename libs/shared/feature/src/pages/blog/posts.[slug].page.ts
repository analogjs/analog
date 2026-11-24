// Example shared library page mounted at /blog/posts/[slug].
import {
  injectContent,
  MarkdownComponent,
  type ContentFile,
} from '@analogjs/content';
import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import type { Observable } from 'rxjs';

export interface PostAttributes {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
}

@Component({
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe],
  template: `
    @if (post$ | async; as post) {
      <h1>{{ post.attributes.title }}</h1>
      <analog-markdown [content]="post.content"></analog-markdown>
    }
  `,
})
export default class BlogPostComponent {
  readonly post$: Observable<
    ContentFile<PostAttributes | Record<string, never>>
  > = injectContent<PostAttributes>();
}
