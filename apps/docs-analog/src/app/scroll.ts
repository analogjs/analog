import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

const STORAGE_KEY = 'docs:scroll';

/**
 * Angular's built-in scrollPositionRestoration runs immediately after
 * NavigationEnd, but injectContent loads markdown via a dynamic import,
 * so the article isn't in the DOM yet and the page is too short to hold
 * the saved scroll position — the restore gets clamped to 0.
 *
 * This service handles scroll itself:
 *   - records scroll position per URL on every NavigationStart and on
 *     pagehide (persisted to sessionStorage so reloads keep position)
 *   - on back/forward (popstate) and on the initial load, polls the
 *     document height until it can fit the saved offset, then scrolls
 *   - on forward navigation, scrolls to the #anchor if present, else top
 */
@Injectable({ providedIn: 'root' })
export class ScrollRestorer {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private positions = new Map<string, number>();
  private nextIsPopstate = false;
  private firstNavigation = true;

  start(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    this.positions = this.loadPositions();

    this.router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe((e) => {
        if (!this.firstNavigation) {
          this.positions.set(this.router.url, window.scrollY);
          this.persist();
        }
        this.nextIsPopstate = e.navigationTrigger === 'popstate';
      });

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const url = e.urlAfterRedirects;
        const hashIdx = url.indexOf('#');
        const anchor = hashIdx >= 0 ? url.slice(hashIdx + 1) : null;
        // On the initial load (post-reload included) restore from
        // session-stored position even though the trigger is imperative.
        const consider = this.nextIsPopstate || this.firstNavigation;
        const saved = consider ? this.positions.get(url) : undefined;
        this.nextIsPopstate = false;
        this.firstNavigation = false;

        if (typeof saved === 'number') {
          this.restoreWhenTall(saved);
        } else if (anchor) {
          this.scrollToAnchorWhenReady(anchor);
        } else {
          window.scrollTo(0, 0);
        }
      });

    // pagehide fires on reloads and tab close — capture the latest
    // position so the next load can pick it up.
    window.addEventListener('pagehide', () => {
      this.positions.set(this.router.url, window.scrollY);
      this.persist();
    });
  }

  private loadPositions(): Map<string, number> {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw) as Record<string, number>;
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  private persist(): void {
    try {
      const obj: Record<string, number> = {};
      for (const [k, v] of this.positions) obj[k] = v;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      /* storage full or unavailable — skip */
    }
  }

  private restoreWhenTall(y: number): void {
    const deadline = Date.now() + 1500;
    const tick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= y - 2 || Date.now() > deadline) {
        window.scrollTo(0, y);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private scrollToAnchorWhenReady(anchor: string): void {
    const deadline = Date.now() + 1500;
    const tick = () => {
      const el = document.getElementById(anchor);
      if (el || Date.now() > deadline) {
        el?.scrollIntoView({ behavior: 'auto' });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
