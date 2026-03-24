import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
export default class BlogComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  readonly contentFilesResource = contentFilesResource<PostAttributes>(
    (contentFile) => {
      return !contentFile.filename.includes('/archived/');
    },
  );

  ngOnInit() {
    if (
      !isPlatformBrowser(this.platformId) ||
      globalThis.location.pathname !== '/blog/'
    ) {
      return;
    }

    void this.router.navigateByUrl(
      `/blog${globalThis.location.search}${globalThis.location.hash}`,
      { replaceUrl: true },
    );
  }
}
