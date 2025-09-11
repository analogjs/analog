import { ContentRenderer, MarkdownComponent } from '@analogjs/content';
import { contentFileResource } from '@analogjs/content/resources';
import { RouteMeta } from '@analogjs/router';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { ArchivedPostAttributes } from './models';
import { postMetaResolver, postTitleResolver } from './resolvers';
import { ActivatedRoute } from '@angular/router';

export const routeMeta: RouteMeta = {
  title: postTitleResolver,
  meta: postMetaResolver,
};

@Component({
  standalone: true,
  imports: [MarkdownComponent],
  template: `
    @let post = postResource.value();
    @if (post) {
      <h1>{{ $any(post.attributes).title }}</h1>
      @if (toc()) {
        <div>
          <ul>
            @for (item of toc(); track item) {
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
export default class ArchivedPostComponent {
  slug = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('slug') as string),
    ),
    { requireSync: true },
  );
  params = computed(() => ({ customFilename: `archived/${this.slug()}` }));
  readonly postResource = contentFileResource<ArchivedPostAttributes>(
    this.params,
  );
  readonly renderer = inject(ContentRenderer);
  readonly toc = computed(() => {
    const post = this.postResource.value();
    return post && this.renderer.getContentHeadings();
  });
}
