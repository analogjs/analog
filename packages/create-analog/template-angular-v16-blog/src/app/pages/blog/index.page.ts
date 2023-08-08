import { Component } from '@angular/core';
import { injectContentFiles } from '@analogjs/content';
import { NgForOf } from '@angular/common';
import PostAttributes from '../../post-attributes';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [NgForOf],
  template: `
    <h1>Blog Archive</h1>
    <a *ngFor="let post of posts" [href]="'/blog/' + post.attributes.slug">
      <h2 class="post__title">{{ post.attributes.title }}</h2>
      <p class="post__desc">{{ post.attributes.description }}</p>
    </a>
  `,
  styles: [
    `
      a {
        text-align: left;
        display: block;
        margin-bottom: 2rem;
      }

      .post__title,
      .post__desc {
        margin: 0;
      }
    `,
  ],
})
export default class HomeComponent {
  readonly posts = injectContentFiles<PostAttributes>();
}
