import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectContent, MarkdownComponent } from '@analogjs/content';

@Component({
  imports: [MarkdownComponent],
  template: `
    @if (post(); as post) {
      <h1>{{ post.attributes['title'] }}</h1>
      <analog-markdown [content]="post.content" />
    }
  `,
})
export default class BlogPostPageComponent {
  readonly post = toSignal(injectContent<{ title: string }>('slug'));
}
