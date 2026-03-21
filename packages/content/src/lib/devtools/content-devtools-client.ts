/**
 * Client-side script for the Analog Content DevTools panel.
 * Injected by the Vite plugin in dev mode only.
 *
 * @experimental Content DevTools is experimental and may change in future releases.
 */

interface DevToolsData {
  renderer: string;
  parseTimeMs: number;
  frontmatter: Record<string, unknown>;
  toc: Array<{ id: string; level: number; text: string }>;
  contentLength: number;
  headingCount: number;
}

const STORAGE_KEY = 'analog-content-devtools-open';

function createPanel(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'analog-content-devtools';
  root.innerHTML = `
    <button class="acd-toggle" title="Analog Content DevTools">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/>
        <path d="M8 13h8v1H8zm0 3h6v1H8z" opacity=".6"/>
      </svg>
    </button>
    <div class="acd-panel" style="display:none">
      <div class="acd-header">
        <span>Analog Content DevTools <span class="acd-badge acd-badge-experimental">experimental</span></span>
      </div>
      <div class="acd-tabs">
        <button class="acd-tab" data-tab="overview" data-active="true">Overview</button>
        <button class="acd-tab" data-tab="frontmatter">Frontmatter</button>
        <button class="acd-tab" data-tab="toc">TOC</button>
      </div>
      <div class="acd-body">
        <div class="acd-empty">No content data available. Navigate to a content page.</div>
      </div>
    </div>
  `;
  return root;
}

function renderOverview(data: DevToolsData): string {
  const speedClass =
    data.parseTimeMs < 5 ? 'acd-fast' : data.parseTimeMs > 50 ? 'acd-slow' : '';
  return `
    <div class="acd-section">
      <div class="acd-section-title">Renderer</div>
      <div class="acd-kv">
        <span class="acd-key">Active</span>
        <span class="acd-value"><span class="acd-badge acd-badge-renderer">${data.renderer}</span></span>
      </div>
      <div class="acd-kv">
        <span class="acd-key">Parse time</span>
        <span class="acd-value ${speedClass}">${data.parseTimeMs.toFixed(2)}ms</span>
      </div>
    </div>
    <div class="acd-section">
      <div class="acd-section-title">Content</div>
      <div class="acd-kv">
        <span class="acd-key">Length</span>
        <span class="acd-value">${data.contentLength.toLocaleString()} chars</span>
      </div>
      <div class="acd-kv">
        <span class="acd-key">Headings</span>
        <span class="acd-value">${data.headingCount}</span>
      </div>
      <div class="acd-kv">
        <span class="acd-key">Frontmatter keys</span>
        <span class="acd-value">${Object.keys(data.frontmatter).length}</span>
      </div>
    </div>
  `;
}

function renderFrontmatter(data: DevToolsData): string {
  const keys = Object.keys(data.frontmatter);
  if (keys.length === 0) {
    return '<div class="acd-empty">No frontmatter found.</div>';
  }
  return `
    <div class="acd-section">
      <div class="acd-section-title">Frontmatter attributes</div>
      <div class="acd-pre">${escapeHtml(JSON.stringify(data.frontmatter, null, 2))}</div>
    </div>
  `;
}

function renderToc(data: DevToolsData): string {
  if (data.toc.length === 0) {
    return '<div class="acd-empty">No headings found.</div>';
  }
  const items = data.toc
    .map(
      (h) =>
        `<div class="acd-toc-item" style="padding-left:${(h.level - 1) * 12}px">
          <a href="#${h.id}">
            ${'#'.repeat(h.level)} ${escapeHtml(h.text)}
          </a>
        </div>`,
    )
    .join('');
  return `
    <div class="acd-section">
      <div class="acd-section-title">Table of Contents (${data.toc.length} headings)</div>
      ${items}
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initDevTools() {
  if (document.getElementById('analog-content-devtools')) return;

  const panel = createPanel();
  document.body.appendChild(panel);

  const toggle = panel.querySelector('.acd-toggle') as HTMLElement;
  const panelEl = panel.querySelector('.acd-panel') as HTMLElement;
  const body = panel.querySelector('.acd-body') as HTMLElement;
  const tabs = panel.querySelectorAll('.acd-tab');

  let isOpen = localStorage.getItem(STORAGE_KEY) === 'true';
  let activeTab = 'overview';
  let currentData: DevToolsData | null = null;

  function updateVisibility() {
    panelEl.style.display = isOpen ? 'flex' : 'none';
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }

  function updateBody() {
    if (!currentData) {
      body.innerHTML =
        '<div class="acd-empty">No content data available. Navigate to a content page.</div>';
      return;
    }
    switch (activeTab) {
      case 'overview':
        body.innerHTML = renderOverview(currentData);
        break;
      case 'frontmatter':
        body.innerHTML = renderFrontmatter(currentData);
        break;
      case 'toc':
        body.innerHTML = renderToc(currentData);
        break;
    }
  }

  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    updateVisibility();
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = (tab as HTMLElement).dataset['tab'] || 'overview';
      tabs.forEach((t) =>
        (t as HTMLElement).setAttribute('data-active', String(t === tab)),
      );
      updateBody();
    });
  });

  // Listen for data from the content pipeline
  window.addEventListener('analog-content-devtools-data', ((
    e: CustomEvent<DevToolsData>,
  ) => {
    currentData = e.detail;
    updateBody();
  }) as EventListener);

  updateVisibility();
}

// Init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDevTools);
} else {
  initDevTools();
}
