import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { contentFilesResource } from '@analogjs/content/resources';

import { PostAttributes } from './models';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>Blog</h1>

    <ul>
      @for (post of contentFilesResource.value(); track post.slug) {
        <li>
          <a [routerLink]="post.slug"> {{ post.attributes.title }}</a>
        </li>
      }
    </ul>
  `,
})
export default class BlogComponent {
  readonly contentFilesResource = contentFilesResource<PostAttributes>(
    (contentFile) => {
      return !contentFile.filename.includes('/archived/');
    },
  );
}
