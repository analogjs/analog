import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';

interface Line {
  text: string;
  cls: string;
}

const FAST = 18; // ms per asset line
const SLOW = 220; // ms for header / "✓ built" type lines

/**
 * Captured verbatim from a `pnpm vite build` run on this docs site.
 * Both client and server (ssr) environments shown.
 */
const RAW = `$ vite build
vite building client environment for production...
vite building ssr environment for production...
transforming...
✓ 325 modules transformed.
rendering chunks...
✓ 985 modules transformed.
computing gzip size...
dist/client/index.html                                  1.42 kB │ gzip:  0.71 kB
dist/client/assets/styles-DG3kLxYZ.css                  8.74 kB │ gzip:  2.31 kB
dist/client/assets/router-Bs1mQ2Dn.js                  18.55 kB │ gzip:  6.84 kB
dist/client/assets/content-BMF8KG2I.js                 59.86 kB │ gzip:  5.31 kB
dist/client/assets/(home).page-CKxFXlHY.js             21.67 kB │ gzip:  5.60 kB
dist/client/assets/docs.page-DdVccY_7.js                1.65 kB │ gzip:  0.82 kB
dist/client/assets/__...slug__.page-BL_P3rL8.js        22.80 kB │ gzip:  6.86 kB
dist/client/assets/SidebarDrawer-CauwW0x6.js           10.26 kB │ gzip:  2.94 kB
dist/client/assets/index-CVGT2tp1.js                  366.98 kB │ gzip: 98.56 kB
dist/ssr/assets/__...slug__.page-DtcjJoL6.mjs             0.08 kB │ gzip:  0.09 kB
dist/ssr/assets/overview-BdZizd5o2.mjs                    0.33 kB │ gzip:  0.24 kB
dist/ssr/assets/overview-gxyYn8v8.mjs                     0.34 kB │ gzip:  0.26 kB
dist/ssr/assets/contributing-B83XZww7.mjs                 0.35 kB │ gzip:  0.24 kB
dist/ssr/assets/overview-CQRmUDJ9.mjs                     0.35 kB │ gzip:  0.26 kB
dist/ssr/assets/support-DLAA5sQ1.mjs                      1.46 kB │ gzip:  0.74 kB
dist/ssr/assets/compatibility-BZp34UUz.mjs                1.58 kB │ gzip:  0.73 kB
dist/ssr/assets/docs.page-DdVccY_7.mjs                    1.65 kB │ gzip:  0.82 kB
dist/ssr/assets/introduction-N_pq0X4B.mjs                 1.66 kB │ gzip:  0.88 kB
dist/ssr/assets/sponsoring-B3SIcVC_.mjs                   3.26 kB │ gzip:  1.44 kB
dist/ssr/assets/ai-CM8fF-iZ.mjs                           3.37 kB │ gzip:  1.58 kB
dist/ssr/assets/code-generation-D3nEY0Jc.mjs              3.46 kB │ gzip:  0.91 kB
dist/ssr/assets/getting-started-BBfHjgQX.mjs              4.35 kB │ gzip:  1.19 kB
dist/ssr/assets/sidebar-0YQ3z2x-.mjs                      5.00 kB │ gzip:  1.27 kB
dist/ssr/assets/nx-BNqm_DkJ.mjs                           5.02 kB │ gzip:  1.63 kB
dist/ssr/assets/overview-44-GjfuI.mjs                     6.48 kB │ gzip:  2.29 kB
dist/ssr/assets/css-preprocessors-CQfu_AHS.mjs            8.38 kB │ gzip:  1.26 kB
dist/ssr/assets/server-side-data-fetching-Cfucm9Ra.mjs    9.50 kB │ gzip:  1.60 kB
dist/ssr/assets/SidebarDrawer-CauwW0x6.mjs               10.26 kB │ gzip:  2.94 kB
dist/ssr/assets/middleware-C797dNXV.mjs                  10.60 kB │ gzip:  1.44 kB
dist/ssr/assets/migrating-hJYmSKgU.mjs                   11.88 kB │ gzip:  1.54 kB
dist/ssr/assets/contributing-XmnAkxCh.mjs                14.82 kB │ gzip:  3.31 kB
dist/ssr/assets/og-image-generation-DxcxVtL1.mjs         15.48 kB │ gzip:  2.35 kB
dist/ssr/assets/server-side-rendering-C01L6B-f.mjs       17.74 kB │ gzip:  2.03 kB
dist/ssr/assets/angular-material-i01XyO0x.mjs            18.14 kB │ gzip:  2.48 kB
dist/ssr/assets/(home).page-CKxFXlHY.mjs                 21.67 kB │ gzip:  5.60 kB
dist/ssr/assets/__...slug__.page-BL_P3rL8.mjs            22.80 kB │ gzip:  6.86 kB
dist/ssr/assets/metadata-C5mGU_4S.mjs                    22.59 kB │ gzip:  2.38 kB
dist/ssr/assets/websockets-fkNokGag.mjs                  25.44 kB │ gzip:  2.46 kB
dist/ssr/assets/libraries-BouNIxxQ.mjs                   28.63 kB │ gzip:  2.94 kB
dist/ssr/assets/migrating-7oCQdL3T.mjs                   31.68 kB │ gzip:  3.39 kB
dist/ssr/assets/forms-CNTfSCaP.mjs                       37.20 kB │ gzip:  3.53 kB
dist/ssr/assets/vitest-Ct7_OCIH.mjs                      41.57 kB │ gzip:  4.03 kB
dist/ssr/assets/providers-CWTrAY_M.mjs                   47.16 kB │ gzip:  7.26 kB
dist/ssr/assets/ionic-BwIlEq-c.mjs                       51.91 kB │ gzip:  5.77 kB
dist/ssr/assets/static-site-generation-C5zOsHes.mjs      58.21 kB │ gzip:  4.62 kB
dist/ssr/assets/contributors-BZhKJ-kP.mjs                58.87 kB │ gzip:  7.22 kB
dist/ssr/assets/storybook-BmH4JEXl.mjs                   59.04 kB │ gzip:  4.96 kB
dist/ssr/assets/content-CpCKBY6T.mjs                     62.11 kB │ gzip:  5.44 kB
dist/ssr/assets/providers-BB74njZp.mjs                   71.76 kB │ gzip:  9.19 kB
dist/ssr/assets/content-2qeL0Vxi.mjs                     76.30 kB │ gzip:  6.34 kB
dist/ssr/assets/static-site-generation-AUywW2Um.mjs      80.39 kB │ gzip:  5.36 kB
dist/ssr/main.server.mjs                                130.82 kB │ gzip: 26.11 kB
✓ built in 7.66s`;

const SCRIPT: Line[] = parseScript(RAW);

function parseScript(raw: string): Line[] {
  return raw
    .split('\n')
    .filter((l) => l.length > 0)
    .map((text) => ({ text, cls: classify(text) }));
}

function classify(text: string): string {
  if (text.startsWith('$ ')) return 'cmd';
  if (text.startsWith('✓ ')) return 'ok';
  if (text.startsWith('dist/')) return 'asset';
  if (text.startsWith('[plugin')) return 'dim';
  return 'dim';
}

function delayFor(line: Line): number {
  if (line.cls === 'cmd') return 0;
  if (line.cls === 'asset') return FAST;
  return SLOW;
}

@Component({
  selector: 'docs-terminal',
  template: `
    <div
      class="overflow-hidden rounded-xl border bg-[#0d1117] text-sm shadow-2xl"
      style="border-color: #1f2937"
    >
      <div class="flex items-center gap-2 border-b border-[#1f2937] px-4 py-2">
        <span class="h-3 w-3 rounded-full bg-[#ff5f56]"></span>
        <span class="h-3 w-3 rounded-full bg-[#ffbd2e]"></span>
        <span class="h-3 w-3 rounded-full bg-[#27c93f]"></span>
        <span class="ml-3 text-xs text-gray-400">~/my-app</span>
      </div>
      <pre
        #scroller
        class="m-0 h-[360px] overflow-y-auto overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.5] text-gray-200"
      ><code>@for (line of visibleLines(); track $index) {<span [class]="'tline ' + line.cls">{{ line.text }}</span>}<span class="tcursor">▍</span></code></pre>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .tline {
        display: block;
        white-space: pre;
      }
      .tline.cmd {
        color: #c9d1d9;
      }
      .tline.ok {
        color: #4ade80;
      }
      .tline.dim {
        color: #8b949e;
      }
      .tline.asset {
        color: #c9d1d9;
      }
      .tcursor {
        display: inline-block;
        color: #f43f5e;
        animation: blink 0.9s infinite;
      }
      @keyframes blink {
        0%,
        49% {
          opacity: 1;
        }
        50%,
        100% {
          opacity: 0;
        }
      }
      /* Slim, dark scrollbar so the box reads as a terminal not a panel. */
      pre::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      pre::-webkit-scrollbar-thumb {
        background: #1f2937;
        border-radius: 4px;
      }
    `,
  ],
})
export class Terminal {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly visibleLines = signal<Line[]>([]);
  protected readonly scroller =
    viewChild.required<ElementRef<HTMLPreElement>>('scroller');

  private autoFollow = true;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      this.visibleLines.set(SCRIPT);
      return;
    }

    // Auto-scroll to bottom on every line append, until the user
    // scrolls up manually.
    effect(() => {
      this.visibleLines();
      const el = this.scroller().nativeElement;
      requestAnimationFrame(() => {
        if (!this.autoFollow) return;
        el.scrollTop = el.scrollHeight;
      });
    });

    let cancelled = false;
    this.destroyRef.onDestroy(() => {
      cancelled = true;
    });

    const onUserScroll = () => {
      const el = this.scroller().nativeElement;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
      this.autoFollow = atBottom;
    };

    queueMicrotask(() => {
      this.scroller().nativeElement.addEventListener('scroll', onUserScroll, {
        passive: true,
      });
    });

    const run = async () => {
      while (!cancelled) {
        this.visibleLines.set([]);
        this.autoFollow = true;
        for (const line of SCRIPT) {
          if (cancelled) return;
          await wait(delayFor(line));
          this.visibleLines.update((prev) => [...prev, line]);
        }
        await wait(5000);
      }
    };
    run();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
