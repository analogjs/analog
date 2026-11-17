import { MarkdownComponent } from '@analogjs/content';
import { contentFileResource } from '@analogjs/content/resources';
import type { RouteMeta } from '@analogjs/router';
import { computed } from '@angular/core';

import type { PostAttributes } from './models';

export const routeMeta: RouteMeta = { title: 'Blog post' };

export default function BlogPostPage() @{
  const resource = contentFileResource<PostAttributes>();
  const post = computed(() => resource.value());

  <article>
    @if (post()) {
      <>
        <h1 id="post-title">{post()!.attributes.title}</h1>
        <analog-markdown use={[MarkdownComponent]} content={post()!.content} />
      </>
    }
  </article>
}
