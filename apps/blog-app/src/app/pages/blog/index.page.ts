import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { contentFilesResource } from '@analogjs/content/resources';
import { analogRouteTree } from '../../../routeTree.gen';
import { routePath } from '@analogjs/router';

import { PostAttributes } from './models';

const blogPostRoute = analogRouteTree.byId['/blog/[slug]'];

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>Blog</h1>

    <ul>
      @for (post of contentFilesResource.value(); track post.slug) {
        <li>
          @let postLink =
            routePath(blogPostRoute.fullPath, {
              params: { slug: post.slug },
            });
          <a [routerLink]="postLink.path"> {{ post.attributes.title }}</a>
        </li>
      }
    </ul>
  `,
})
export default class BlogComponent implements OnInit {
  readonly routePath = routePath;
  readonly blogPostRoute = blogPostRoute;
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
