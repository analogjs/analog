import { injectContent, MarkdownComponent } from '@analogjs/content';
import { AsyncPipe, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { BlogAttributes } from '../../../lib/blog-attributes';

@Component({
  selector: 'blog-post',
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe, NgIf],
  template: `
    <ng-container *ngIf="contentFile$ | async as cf">
      <h1>{{ cf.attributes.title }}</h1>
      <analog-markdown [content]="cf.content"></analog-markdown>
    </ng-container>
  `,
})
export default class BlogPostComponent {
  public contentFile$ = injectContent<BlogAttributes>();
}
