import { injectContent, MarkdownComponent } from '@analogjs/content';
import { AsyncPipe, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';
import AnalogMarkdownComponent from '../../../../../packages/content/src/lib/markdown.component';

interface PostAttributes {
  title: string;
}

@Component({
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe, NgIf, AnalogMarkdownComponent],
  template: `
    <ng-container *ngIf="post$ | async as post">
      <h1>{{ post.attributes.title }}</h1>
      <analog-markdown [content]="post.content"></analog-markdown>
    </ng-container>
  `,
})
export default class ProjectComponent {
  readonly post$ = injectContent<PostAttributes>({
    subdirectory: 'projects',
    param: 'slug',
  });
}
