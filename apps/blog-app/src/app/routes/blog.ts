import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { injectContentFiles } from '@analogjs/content';
import { NgFor } from '@angular/common';

interface MyAttributes {
  title: string;
  slug: string;
}
@Component({
  selector: 'blog',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgFor],
  template: `
    <ng-container *ngFor="let attribute of fileAttributes">
      <a [routerLink]="attribute.slug"> {{ attribute.title }}</a> |
    </ng-container>
    <a routerLink="/about">About</a>

    <router-outlet></router-outlet>
  `,
})
export default class BlogComponent {
  public fileAttributes = injectContentFiles<MyAttributes>().map(
    (file) => file.attributes
  );
}
