# Build with AI

Analog provides integrations to use AI-assisted development practics.

## LLMs Index files

Analog's docs site publishes two AI-friendly index files at the site root:

- `https://analogjs.org/llms.txt`
- `https://analogjs.org/llms-full.txt`

These files make it easier to feed the docs into AI-assisted workflows without crawling the full site manually.

### What's the difference?

#### `llms.txt`

`llms.txt` is a compact index of the docs. It contains the page titles, URLs, and short descriptions so an assistant or retrieval pipeline can discover the relevant docs pages quickly.

Use it when you want:

- a lightweight entry point for retrieval
- a page index for custom RAG pipelines
- a quick way to point an AI tool at the Analog docs corpus

#### `llms-full.txt`

`llms-full.txt` is the expanded version. It concatenates the full Markdown content for the docs pages into a single text file.

Use it when you want:

- a single file for local indexing
- a fuller context window for long-form prompting
- offline processing without fetching each docs page individually

## Per-page Markdown

Every docs page is also published as raw Markdown at its `.md` URL. Append `.md` to any docs page URL to fetch a clean, chrome-free Markdown version of just that page:

- `https://analogjs.org/docs/features/routing/overview`: the rendered page
- `https://analogjs.org/docs/features/routing/overview.md`: the raw Markdown

Use it when you want:

- a single page as context instead of the full corpus
- an addressable source an agent can fetch on demand
- Markdown without the site navigation and other page chrome

Every docs page also has a **Copy page** button next to its title that copies the page as Markdown to the clipboard — handy for pasting into an AI assistant with formatting intact — with a dropdown to view the raw Markdown at the page's `.md` URL.

## Section indexes

In addition to the site-wide `llms.txt`, each multi-page docs section publishes its own scoped index at `llms.txt` under the section path, for example:

- `https://analogjs.org/docs/features/llms.txt`
- `https://analogjs.org/docs/integrations/llms.txt`
- `https://analogjs.org/docs/packages/llms.txt`

Use a section index when you only need part of the docs, for example pointing an assistant at the integrations docs without pulling in the entire corpus.

## How Analog generates these files

The docs site generates these files automatically during its build:

- `llms.txt`: an index of the docs pages under `src/content`
- a scoped `llms.txt` for each multi-page section, from the same content
- `llms-full.txt`: the Markdown bodies of those pages concatenated into one file
- a per-page `.md` file emitted alongside each prerendered route, via Analog's `outputSourceFile` prerender option

That means the files stay aligned with the published docs instead of requiring a separate export step.

## Framework conventions for coding agents

`@analogjs/platform` ships its own guidance for AI coding assistants, so it tracks the version you have installed instead of drifting from a copy checked into your project.

- `node_modules/@analogjs/platform/AGENTS.md` — Markdown guidance for any client that reads `AGENTS.md`. Generated apps include a root `AGENTS.md` that points here.
- `node_modules/@analogjs/platform/plugin.json` — an [Agent Plugins v1.0.0](https://github.com/agentplugins/agent-plugins-spec) manifest, with the same guidance as a discoverable skill at `skills/analogjs/SKILL.md`.

Both cover file-based routing, server and API routes, data fetching, content routes, and the modern Angular style Analog expects.

Agent Plugins v1 has no discovery mechanism for plugins installed in `node_modules`, so register the plugin root with your client by hand:

```text
node_modules/@analogjs/platform
```

The `AGENTS.md` pointer keeps working with no setup either way.

## Example workflows

### Point an assistant at the docs index

Use `llms.txt` when your AI tool supports a remote docs index:

```text
Use https://analogjs.org/llms.txt as the primary AnalogJS documentation index.
```

### Build a local retrieval corpus

Use `llms-full.txt` when you want one source file for embeddings or local search:

```shell
curl -O https://analogjs.org/llms-full.txt
```

### Combine with normal docs links

The AI-oriented files are a supplement, not a replacement for the published docs UI. Keep linking users to the canonical docs pages when you want navigable documentation, and use the `llms` files when you want AI-friendly ingestion.
