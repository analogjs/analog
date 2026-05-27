import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface Line {
  text: string;
  cls?: string;
  delay: number;
}

const SCRIPT: Line[] = [
  { text: '$ pnpm dev', cls: 'cmd', delay: 0 },
  { text: '', delay: 600 },
  { text: '  ANALOG  v2.5', cls: 'brand', delay: 100 },
  { text: '', delay: 80 },
  { text: '  →  building routes...', cls: 'dim', delay: 120 },
  { text: '  →  loading content from src/content/**', cls: 'dim', delay: 280 },
  {
    text: '  →  registered 12 page routes, 4 API routes',
    cls: 'dim',
    delay: 280,
  },
  { text: '', delay: 80 },
  { text: '  VITE  ready in 482 ms', cls: 'ok', delay: 220 },
  { text: '', delay: 60 },
  { text: '  ➜  Local:    http://localhost:5173/', cls: 'link', delay: 80 },
  { text: '  ➜  Network:  use --host to expose', cls: 'dim', delay: 60 },
  { text: '  ➜  press h to show help', cls: 'dim', delay: 60 },
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
        <span class="ml-3 text-xs text-gray-400">~/my-analog-app</span>
      </div>
      <pre
        class="m-0 min-h-[280px] overflow-x-auto p-4 font-mono text-[13px] leading-[1.65] text-gray-200"
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
      .tline.brand {
        color: #f43f5e;
        font-weight: 700;
      }
      .tline.ok {
        color: #4ade80;
      }
      .tline.dim {
        color: #8b949e;
      }
      .tline.link {
        color: #38bdf8;
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
      // Server: render the whole transcript inert so first paint isn't blank.
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
