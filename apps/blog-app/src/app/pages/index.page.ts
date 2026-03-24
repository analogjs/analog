import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  template: `<p><a href="/blog">Redirecting to the blog...</a></p>`,
})
export default class BlogIndexPageComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    void this.router.navigateByUrl('/blog', { replaceUrl: true });
  }
}
