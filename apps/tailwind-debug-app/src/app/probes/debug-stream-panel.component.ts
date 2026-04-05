import { JsonPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  type TailwindDebugEventEntry,
  type TailwindDebugSource,
} from '../debug/debug-stream.shared';
import { TailwindDebugStreamService } from '../debug/debug-stream.service';

const ALL_SOURCES: TailwindDebugSource[] = [
  'browser',
  'vite:hmr',
  'vite:ws',
  'system',
];

@Component({
  selector: 'app-tailwind-debug-stream-panel',
  standalone: true,
  imports: [JsonPipe],
  template: `
    <section class="panel" data-testid="debug-stream-panel">
      <header class="panel-header">
        <div class="title-block">
          <p class="panel-kicker">Live diagnostics</p>
          <h2>Wiretap console</h2>
          <p class="panel-copy">
            Browser breadcrumbs, Vite HMR payloads, websocket traffic, and
            runtime failures share one live feed.
          </p>
        </div>

        <div class="header-meta">
          <span class="status" [attr.data-state]="stream.connectionState()">
            <span class="status-dot"></span>
            {{ stream.connectionState() }}
          </span>
          <div class="header-actions">
            <button
              type="button"
              class="action-button"
              (click)="togglePaused()"
            >
              {{ paused() ? 'Resume' : 'Pause' }}
            </button>
            <button
              type="button"
              class="action-button"
              (click)="stream.reconnect()"
            >
              Reconnect
            </button>
            <button
              type="button"
              class="action-button"
              (click)="clearEntries()"
            >
              Clear
            </button>
          </div>
        </div>
      </header>

      <section class="stats">
        <article class="stat-card stat-card-primary">
          <span class="stat-label">Visible entries</span>
          <strong class="stat-value">{{ visibleEntries().length }}</strong>
          <span class="stat-footnote">
            {{ stream.entries().length }} captured in memory
          </span>
        </article>
        <article class="stat-card">
          <span class="stat-label">Full reloads</span>
          <strong class="stat-value">{{ stream.fullReloadCount() }}</strong>
          <span class="stat-footnote">Should stay at zero during CSS HMR</span>
        </article>
        <article class="stat-card">
          <span class="stat-label">Browser faults</span>
          <strong class="stat-value">{{ stream.browserErrorCount() }}</strong>
          <span class="stat-footnote"
            >window errors + unhandled rejections</span
          >
        </article>
        @for (source of sources(); track source.key) {
          <article class="stat-card">
            <span class="stat-label">{{ source.key }}</span>
            <strong class="stat-value">{{ source.value }}</strong>
            <span class="stat-footnote">Stream source</span>
          </article>
        }
      </section>

      <section class="control-strip">
        <label class="search">
          <span class="section-label">Search</span>
          <input
            type="search"
            placeholder="Filter by phase, file, payload text..."
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
        </label>

        <div class="filters">
          <span class="section-label">Sources</span>
          <div class="filter-row">
            @for (source of sourceOptions(); track source.source) {
              <button
                type="button"
                class="filter-pill"
                [class.active]="source.enabled"
                [attr.data-source]="source.source"
                (click)="toggleSource(source.source)"
              >
                {{ source.source }}
                <span>{{ source.count }}</span>
              </button>
            }
          </div>
        </div>
      </section>

      @if (stream.latestEntry(); as latest) {
        <section class="latest">
          <div class="section-header">
            <p class="section-label">Latest event</p>
            <span class="latest-time">{{ latest.timestamp }}</span>
          </div>
          <div class="latest-summary">
            <span class="source-pill" [attr.data-source]="latest.source">
              {{ latest.source }}
            </span>
            <strong>{{ latest.summary }}</strong>
          </div>
        </section>
      }

      <section class="timeline">
        <div class="section-header">
          <p class="section-label">Recent pulse</p>
          <span class="timeline-copy">
            Newest events on the right. Paused feed freezes the list, not the
            transport.
          </span>
        </div>
        <div class="timeline-track">
          @for (entry of recentTimeline(); track entry.id) {
            <span
              class="timeline-dot"
              [attr.data-source]="entry.source"
              [attr.title]="entry.summary"
            ></span>
          }
        </div>
      </section>

      <section class="feed" data-testid="debug-stream-feed">
        @if (!visibleEntries().length) {
          <article class="empty-state">
            <strong>No matching events.</strong>
            <p>
              Change the filter or search query, or wait for the next browser or
              HMR event to arrive.
            </p>
          </article>
        }

        @for (entry of visibleEntries(); track entry.id) {
          <article class="entry">
            <div class="entry-header">
              <div class="entry-title">
                <span class="source-pill" [attr.data-source]="entry.source">
                  {{ entry.source }}
                </span>
                <strong>{{ entry.summary }}</strong>
              </div>
              <time>{{ entry.timestamp }}</time>
            </div>
            <pre>{{ entry.payload | json }}</pre>
          </article>
        }
      </section>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .panel {
        display: grid;
        gap: 1.25rem;
        padding: 1.5rem;
        border: 1px solid rgba(148, 163, 184, 0.18);
        background:
          linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.92)),
          radial-gradient(
            circle at top right,
            rgba(56, 189, 248, 0.16),
            transparent 30%
          );
        box-shadow: 0 24px 80px rgba(2, 6, 23, 0.35);
        backdrop-filter: blur(18px);
        border-radius: 1.5rem;
      }

      .panel-header,
      .section-header,
      .entry-header,
      .entry-title,
      .latest-summary,
      .header-meta,
      .header-actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
      }

      .title-block {
        display: grid;
        gap: 0.35rem;
        max-width: 42rem;
      }

      .panel-kicker,
      .section-label,
      .stat-label {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.7rem;
        color: rgba(148, 163, 184, 0.88);
      }

      h2 {
        margin: 0;
        font-size: 1.9rem;
        line-height: 1;
        letter-spacing: -0.04em;
      }

      .panel-copy,
      .timeline-copy,
      .stat-footnote,
      .empty-state p {
        margin: 0;
        font-size: 0.82rem;
        line-height: 1.6;
        color: rgba(191, 219, 254, 0.68);
      }

      .status,
      .source-pill,
      .filter-pill,
      .action-button {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        border-radius: 999px;
        padding: 0.45rem 0.8rem;
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .action-button,
      .filter-pill {
        border: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(15, 23, 42, 0.88);
        color: rgba(226, 232, 240, 0.88);
        cursor: pointer;
      }

      .action-button:hover,
      .filter-pill:hover {
        border-color: rgba(125, 211, 252, 0.36);
        color: rgb(125 211 252);
      }

      .status-dot,
      .timeline-dot {
        display: inline-flex;
        border-radius: 999px;
      }

      .status-dot {
        width: 0.6rem;
        height: 0.6rem;
        background: currentcolor;
        box-shadow: 0 0 0.9rem currentcolor;
      }

      .status[data-state='open'] {
        background: rgba(16, 185, 129, 0.18);
        color: rgb(110 231 183);
      }

      .status[data-state='open'] .status-dot {
        animation: pulse 1.6s infinite;
      }

      .status[data-state='connecting'] {
        background: rgba(250, 204, 21, 0.18);
        color: rgb(253 224 71);
      }

      .status[data-state='closed'] {
        background: rgba(248, 113, 113, 0.18);
        color: rgb(252 165 165);
      }

      .stats {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      }

      .stat-card,
      .latest,
      .entry,
      .timeline,
      .control-strip,
      .empty-state {
        border-radius: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.12);
        background: rgba(2, 6, 23, 0.58);
        padding: 1rem;
      }

      .stat-card-primary {
        background: linear-gradient(
          135deg,
          rgba(14, 165, 233, 0.18),
          rgba(30, 41, 59, 0.72)
        );
      }

      .stat-value {
        display: block;
        margin-top: 0.35rem;
        font-size: 1.7rem;
      }

      .control-strip {
        display: grid;
        gap: 1rem;
      }

      .search {
        display: grid;
        gap: 0.5rem;
      }

      input[type='search'] {
        width: 100%;
        border-radius: 0.9rem;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(15, 23, 42, 0.92);
        padding: 0.9rem 1rem;
        color: rgb(226 232 240);
      }

      .filters {
        display: grid;
        gap: 0.5rem;
      }

      .filter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
      }

      .filter-pill.active {
        border-color: rgba(125, 211, 252, 0.5);
        background: rgba(8, 47, 73, 0.9);
      }

      .filter-pill span {
        color: rgba(191, 219, 254, 0.8);
      }

      .feed {
        display: grid;
        gap: 0.75rem;
        max-height: 34rem;
        overflow: auto;
      }

      .entry {
        display: grid;
        gap: 0.85rem;
      }

      .entry pre {
        margin: 0;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.78rem;
        line-height: 1.45;
        color: rgba(226, 232, 240, 0.86);
      }

      .timeline-track {
        display: grid;
        grid-template-columns: repeat(24, minmax(0, 1fr));
        gap: 0.35rem;
        margin-top: 0.9rem;
      }

      .timeline-dot {
        height: 0.7rem;
        min-width: 0.7rem;
        background: rgba(148, 163, 184, 0.16);
      }

      time,
      .latest-time {
        color: rgba(148, 163, 184, 0.75);
        font-size: 0.78rem;
      }

      .source-pill[data-source='browser'],
      .filter-pill[data-source='browser'].active,
      .timeline-dot[data-source='browser'] {
        background: rgba(56, 189, 248, 0.16);
        color: rgb(125 211 252);
      }

      .source-pill[data-source='vite:hmr'],
      .filter-pill[data-source='vite:hmr'].active,
      .timeline-dot[data-source='vite:hmr'] {
        background: rgba(167, 139, 250, 0.18);
        color: rgb(196 181 253);
      }

      .source-pill[data-source='vite:ws'],
      .filter-pill[data-source='vite:ws'].active,
      .timeline-dot[data-source='vite:ws'] {
        background: rgba(251, 146, 60, 0.18);
        color: rgb(253 186 116);
      }

      .source-pill[data-source='system'],
      .filter-pill[data-source='system'].active,
      .timeline-dot[data-source='system'] {
        background: rgba(148, 163, 184, 0.16);
        color: rgb(203 213 225);
      }

      .empty-state {
        display: grid;
        gap: 0.35rem;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }

        50% {
          opacity: 0.55;
          transform: scale(0.85);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DebugStreamPanelComponent {
  readonly stream = inject(TailwindDebugStreamService);
  readonly query = signal('');
  readonly paused = signal(false);
  readonly enabledSources = signal<Record<TailwindDebugSource, boolean>>({
    browser: true,
    'vite:hmr': true,
    'vite:ws': true,
    system: true,
  });
  readonly frozenEntries = signal<TailwindDebugEventEntry[]>([]);
  readonly displayedEntries = computed(() =>
    this.paused() ? this.frozenEntries() : this.stream.entries(),
  );
  readonly visibleEntries = computed(() => {
    const query = this.query().trim().toLowerCase();
    const enabledSources = this.enabledSources();

    return this.displayedEntries()
      .filter((entry) => enabledSources[entry.source])
      .filter((entry) => {
        if (!query) {
          return true;
        }

        const haystack = `${entry.summary} ${entry.timestamp} ${JSON.stringify(
          entry.payload,
        )}`.toLowerCase();

        return haystack.includes(query);
      })
      .slice()
      .reverse();
  });
  readonly recentTimeline = computed(() => this.stream.entries().slice(-24));
  readonly sources = computed(() =>
    Object.entries(this.stream.sourceCounts()).map(([key, value]) => ({
      key,
      value,
    })),
  );
  readonly sourceOptions = computed(() => {
    const counts = this.stream.sourceCounts();
    const enabled = this.enabledSources();

    return ALL_SOURCES.map((source) => ({
      count: counts[source] ?? 0,
      enabled: enabled[source],
      source,
    }));
  });

  togglePaused() {
    const nextPaused = !this.paused();
    this.paused.set(nextPaused);
    if (nextPaused) {
      this.frozenEntries.set(this.stream.entries());
      return;
    }
    this.frozenEntries.set([]);
  }

  toggleSource(source: TailwindDebugSource) {
    this.enabledSources.update((sources) => ({
      ...sources,
      [source]: !sources[source],
    }));
  }

  clearEntries() {
    this.stream.clear();
    this.frozenEntries.set([]);
  }
}
