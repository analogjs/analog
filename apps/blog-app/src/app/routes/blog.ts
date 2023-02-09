import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { injectContentFiles } from '@analogjs/content';
import { NgFor } from '@angular/common';
import { RouteMeta } from '@analogjs/router';
import { PostAttributes } from '../blog/models';

export const routeMeta: RouteMeta = {
  title: 'Analog Blog',
  meta: [{ name: 'description', content: 'Analog Blog Posts' }],
};

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgFor],
  template: `
    <ng-container *ngFor="let post of posts">
      <a [routerLink]="post.slug"> {{ post.attributes.title }}</a> |
    </ng-container>
    <a routerLink="/about">About</a> |
    <a routerLink="/contact">Contact</a>

    <router-outlet></router-outlet>
  `,
})
export default class BlogComponent {
  readonly posts = injectContentFiles<PostAttributes>();
}
