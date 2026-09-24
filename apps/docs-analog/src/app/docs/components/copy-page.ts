import { Component, computed, inject, input, signal } from '@angular/core';
import { CONTENT_LOCALE } from '@analogjs/content';

/**
 * Prepares raw doc source for the clipboard: strips frontmatter and
 * prepends an H1 from the page title unless the body brings its own
 * (e.g. synced README pages).
 */
export function markdownForCopy(markdown: string, title?: string): string {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, '');
  return title && !body.startsWith('# ') ? `# ${title}\n\n${body}` : body;
}

/**
 * "Copy page" split button shown next to the docs page title. The main
 * segment copies the page's raw Markdown to the clipboard; the dropdown
 * repeats that action and links to the page's `.md` URL. Both are backed
 * by the `.md` asset emitted at prerender via the `outputSourceFile`
 * option (the runtime `doc.content` is already rendered HTML), so the
 * copy action fetches that asset on first use.
 */
@Component({
  selector: 'docs-copy-page',
  template: `
    <div class="relative inline-flex text-sm">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-l border px-2.5 py-1.5 hover:bg-[var(--bg-subtle)]"
        style="border-color: var(--border)"
        (click)="copy()"
      >
        @if (copied()) {
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Copied
        } @else {
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy page
        }
      </button>
      <button
        type="button"
        class="flex items-center rounded-r border border-l-0 px-1.5 hover:bg-[var(--bg-subtle)]"
        style="border-color: var(--border)"
        aria-haspopup="menu"
        aria-label="Copy page options"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      @if (open()) {
        <ul
          role="menu"
          class="absolute left-0 top-full z-10 mt-1 min-w-[13rem] rounded border py-1 shadow-lg"
          style="border-color: var(--border); background: var(--bg-elevated)"
        >
          <li>
            <button
              type="button"
              role="menuitem"
              class="block w-full px-3 py-1.5 text-left hover:bg-[var(--bg-subtle)]"
              (click)="copy()"
            >
              Copy page as Markdown
            </button>
          </li>
          <li>
            <a
              role="menuitem"
              class="block px-3 py-1.5 hover:bg-[var(--bg-subtle)]"
              [href]="mdUrl()"
              target="_blank"
              rel="noopener"
              (click)="open.set(false)"
            >
              View as Markdown
            </a>
          </li>
        </ul>
      }
    </div>
  `,
})
export class CopyPage {
  readonly pageTitle = input<string>();
  readonly slug = input.required<string>();

  private readonly locale = inject(CONTENT_LOCALE, { optional: true });

  protected readonly open = signal(false);
  protected readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly mdUrl = computed(() =>
    this.locale
      ? `/${this.locale}/docs/${this.slug()}.md`
      : `/docs/${this.slug()}.md`,
  );

  protected async copy(): Promise<void> {
    this.open.set(false);
    const res = await fetch(this.mdUrl());
    const text = res.ok ? await res.text() : '';
    // The .md assets only exist in prerendered output; a dev server may
    // answer with the SPA shell instead. Treat both as "nothing to copy".
    if (!text || text.trimStart().startsWith('<')) return;
    await navigator.clipboard?.writeText(
      markdownForCopy(text, this.pageTitle()),
    );
    this.copied.set(true);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
  }
}
