import { ContentRenderer, MarkdownComponent } from '@analogjs/content';
import { contentFileResource } from '@analogjs/content/resources';
import { RouteMeta } from '@analogjs/router';
import { Component, computed, inject } from '@angular/core';

import { PostAttributes } from './models';
import { postMetaResolver, postTitleResolver } from './resolvers';

export const routeMeta: RouteMeta = {
  title: postTitleResolver,
  meta: postMetaResolver,
};

@Component({
  standalone: true,
  imports: [MarkdownComponent],
  template: `
    @let post = postResource.value();
    @let tocHeadings = toc();

    @if (post) {
      <h1>{{ post.attributes.title }}</h1>

      @if (tocHeadings) {
        <div>
          <ul>
            @for (item of tocHeadings; track item) {
              <li>
                <a href="#{{ item.id }}">{{ item.text }}</a>
              </li>
            }
          </ul>
        </div>
      }

      <analog-markdown [content]="post.content"></analog-markdown>
    }
  `,
})
export default class BlogPostComponent {
  readonly renderer = inject(ContentRenderer);
  readonly postResource = contentFileResource<PostAttributes>();
  readonly toc = computed(() => {
    const post = this.postResource.value();
    return post && this.renderer.getContentHeadings();
  });
}
