import { injectContentFiles } from '@analogjs/content';
import { Component } from '@angular/core';
import { ArchivedPostAttributes } from './models';
import { RouterLink } from '@angular/router';
import { NgFor } from '@angular/common';

@Component({
  standalone: true,
  imports: [RouterLink, NgFor],
  template: `
    <h1>Archived</h1>
    <p>Drafts are filtered out here.</p>
    <ul>
      <li *ngFor="let post of posts">
        <a [routerLink]="post.slug"> {{ post.attributes.title }}</a>
      </li>
    </ul>
  `,
})
export default class ArchivedComponent {
  readonly posts = injectContentFiles<ArchivedPostAttributes>((contentFile) => {
    return (
      !contentFile.attributes.draft &&
      contentFile.filename.includes('/archived/')
    );
  });
}
