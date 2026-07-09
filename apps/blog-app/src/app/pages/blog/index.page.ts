import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Image } from '@analogjs/content/image';
import { contentFilesResource } from '@analogjs/content/resources';

import { PostAttributes } from './models';

@Component({
  standalone: true,
  imports: [RouterLink, Image],
  template: `
    <h1>Blog</h1>

    <ul>
      @for (post of contentFilesResource.value(); track post.slug) {
        <li>
          <a [routerLink]="post.slug"> {{ post.attributes.title }}</a>
          @if (post.attributes.coverImage) {
            <Image
              [src]="post.attributes.coverImage"
              [alt]="post.attributes.title"
              width="464"
              height="309"
            />
          }
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
