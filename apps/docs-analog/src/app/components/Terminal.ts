import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';

interface Line {
  text: string;
  cls?: string;
  delay: number;
}

/**
 * Lifted from a real `pnpm vite build` run on this docs app.
 * Trimmed to a representative subset so the animation reads naturally
 * inside a 360px terminal window.
 */
const SCRIPT: Line[] = [
  { text: '$ pnpm vite build', cls: 'cmd', delay: 0 },
  { text: '', delay: 600 },
  { text: 'vite v8.0.0 building for production...', cls: 'dim', delay: 100 },
  { text: 'transforming...', cls: 'dim', delay: 180 },
  { text: '✓ 412 modules transformed.', cls: 'ok', delay: 1400 },
  { text: 'rendering chunks...', cls: 'dim', delay: 200 },
  { text: 'computing gzip size...', cls: 'dim', delay: 400 },
  { text: '', delay: 80 },
  {
    text: 'dist/client/index.html                       1.42 kB │ gzip:  0.71 kB',
    cls: 'asset',
    delay: 120,
  },
  {
    text: 'dist/client/assets/styles-DG3kLxYZ.css       8.74 kB │ gzip:  2.31 kB',
    cls: 'asset',
    delay: 80,
  },
  {
    text: 'dist/client/assets/router-Bs1mQ2Dn.js       18.55 kB │ gzip:  6.84 kB',
    cls: 'asset',
    delay: 80,
  },
  {
    text: 'dist/client/assets/content-BMF8KG2I.js      59.86 kB │ gzip:  5.31 kB',
    cls: 'asset',
    delay: 80,
  },
  {
    text: 'dist/client/assets/index-CVGT2tp1.js       366.98 kB │ gzip: 98.56 kB',
    cls: 'asset',
    delay: 80,
  },
  { text: '', delay: 120 },
  { text: '✓ built in 8.22s', cls: 'ok', delay: 220 },
];

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
        class="m-0 h-[360px] overflow-hidden p-4 font-mono text-[13px] leading-[1.55] text-gray-200"
      ><code>@for (line of visibleLines(); track $index) {<span [class]="'tline ' + (line.cls || '')">{{ line.text }}</span>
}<span class="tcursor">▍</span></code></pre>
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
    `,
  ],
})
export class Terminal {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly visibleLines = signal<Line[]>([]);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      this.visibleLines.set(SCRIPT);
      return;
    }
    let cancelled = false;
    this.destroyRef.onDestroy(() => {
      cancelled = true;
    });
    const run = async () => {
      while (!cancelled) {
        this.visibleLines.set([]);
        for (const line of SCRIPT) {
          if (cancelled) return;
          await wait(line.delay);
          this.visibleLines.update((prev) => [...prev, line]);
        }
        await wait(4500);
      }
    };
    run();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
