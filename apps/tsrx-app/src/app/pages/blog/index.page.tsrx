import { contentFilesResource } from '@analogjs/content/resources';
import type { RouteMeta } from '@analogjs/router';
import { RouterLink } from '@angular/router';

import type { PostAttributes } from './models';

export const routeMeta: RouteMeta = { title: 'Blog' };

export default function BlogPage() @{
  const posts = contentFilesResource<PostAttributes>();

  <section>
    <h1>{'Blog'}</h1>
    <ul id="posts">
      @for (const post of posts.value() ?? []; key post.slug) {
        <li>
          <a use={[RouterLink]} routerLink={`/blog/${post.slug}`}>{post.attributes.title}</a>
          {': '}{post.attributes.description}
        </li>
      }
    </ul>
  </section>
}
