import { contentFilesResource } from '@analogjs/content/resources';
import { Component } from '@angular/core';
import { ArchivedPostAttributes } from './models';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>Archived</h1>
    <p>Drafts are filtered out here.</p>
    <ul>
      @for (post of posts.value(); track post.slug) {
        <li>
          <a [routerLink]="post.slug"> {{ post.attributes.title }}</a>
        </li>
      }
    </ul>
  `,
})
export default class ArchivedComponent {
  readonly posts = contentFilesResource<ArchivedPostAttributes>(
    (contentFile) => {
      return (
        !contentFile.attributes.draft &&
        contentFile.filename.includes('/archived/')
      );
    },
  );
}
