import {
  ContentRenderer,
  injectContent,
  MarkdownComponent,
} from '@analogjs/content';
import { RouteMeta } from '@analogjs/router';
import { AsyncPipe, JsonPipe, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { map } from 'rxjs';

import { PostAttributes } from './models';
import { postMetaResolver, postTitleResolver } from './resolvers';

export const routeMeta: RouteMeta = {
  title: postTitleResolver,
  meta: postMetaResolver,
};

@Component({
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe, NgIf, NgFor, JsonPipe],
  template: `
    <ng-container *ngIf="post$ | async as post">
      <h1>{{ post.attributes.title }}</h1>
      <div *ngIf="toc$ | async as toc">
        <ul>
          <li *ngFor="let item of toc">
            <a href="#{{ item.id }}">{{ item.text }}</a>
          </li>
        </ul>
      </div>

      <analog-markdown [content]="post.content"></analog-markdown>
    </ng-container>
  `,
})
export default class BlogPostComponent {
  readonly renderer = inject(ContentRenderer);
  readonly post$ = injectContent<PostAttributes>();

  readonly toc$ = this.post$.pipe(
    map(() => {
      return this.renderer.getContentHeadings();
    })
  );
}
