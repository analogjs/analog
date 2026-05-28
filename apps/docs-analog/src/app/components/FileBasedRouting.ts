import { Component } from '@angular/core';

interface Mapping {
  file: string;
  url: string;
  highlight?: boolean;
}

const MAPPINGS: Mapping[] = [
  { file: '(home).page.ts', url: '/' },
  { file: 'about.page.ts', url: '/about' },
  { file: 'docs/[[...slug]].page.ts', url: '/docs/*', highlight: true },
  { file: 'products/[id].page.ts', url: '/products/:id' },
  { file: 'api/og.ts', url: '/api/og' },
];

@Component({
  selector: 'docs-file-routing',
  template: `
    <div class="grid items-stretch gap-4">
      <div
        class="rounded-xl border p-5 font-mono text-sm"
        style="border-color: #1f2937; background: #011627; color: #d6deeb"
      >
        <p class="mb-3 text-xs uppercase tracking-wide" style="color: #8b949e">
          src/app/pages/
        </p>
        <ul class="space-y-1">
          @for (m of mappings; track m.file) {
            <li
              class="rounded px-2 py-1"
              [class.font-semibold]="m.highlight"
              [style.background]="
                m.highlight ? 'rgba(255,255,255,0.06)' : 'transparent'
              "
              [style.color]="m.highlight ? '#fb7185' : '#d6deeb'"
            >
              {{ m.file }}
            </li>
          }
        </ul>
      </div>

      <div
        class="rounded-xl border p-5 font-mono text-sm"
        style="border-color: #1f2937; background: #011627; color: #d6deeb"
      >
        <p class="mb-3 text-xs uppercase tracking-wide" style="color: #8b949e">
          generated routes
        </p>
        <ul class="space-y-1">
          @for (m of mappings; track m.url) {
            <li
              class="rounded px-2 py-1"
              [class.font-semibold]="m.highlight"
              [style.background]="
                m.highlight ? 'rgba(255,255,255,0.06)' : 'transparent'
              "
              [style.color]="m.highlight ? '#fb7185' : '#d6deeb'"
            >
              {{ m.url }}
            </li>
          }
        </ul>
      </div>
    </div>
  `,
})
export class FileBasedRouting {
  protected readonly mappings = MAPPINGS;
}
