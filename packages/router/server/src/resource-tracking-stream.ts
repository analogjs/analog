import type { ɵResourceTrackingView } from '@analogjs/router/tokens';

/** Request-local previews. The live Angular DOM is never annotated or changed. */
export class ResourceTrackingStream {
  private readonly views = new Map<string, ɵResourceTrackingView>();
  private readonly dirty = new Set<string>();
  private nextId = 0;
  private document?: Document;
  private timer?: ReturnType<typeof setTimeout>;
  private shellSent = false;
  private stopped = false;
  private failure?: { error: unknown };

  constructor(private readonly enqueue: (html: string) => void) {}

  register(view: ɵResourceTrackingView) {
    const id = `u${this.nextId++}`;
    this.views.set(id, view);
    const update = () => {
      this.dirty.add(id);
      this.schedule();
    };
    update();
    return {
      update,
      destroy: () => {
        this.views.delete(id);
        this.dirty.delete(id);
      },
    };
  }

  start(document: Document): void {
    this.document = document;
    this.schedule();
  }

  finish(): void {
    if (this.failure) throw this.failure.error;
    this.flush();
    this.stop();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.views.clear();
    this.dirty.clear();
  }

  private schedule(): void {
    if (this.stopped || !this.document || this.timer !== undefined) return;
    // Let Angular finish change detection, including chained resource loaders.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      try {
        this.flush();
      } catch (error) {
        this.failure = { error };
        this.stop();
      }
    }, 0);
  }

  private flush(): void {
    if (this.stopped || !this.document || this.dirty.size === 0) return;
    const { body, ranges } = this.snapshot(this.document);
    // A scope can be registered in a detached parent before its route appears.
    if (ranges.size === 0) return;
    if (!this.shellSent) {
      this.enqueue(
        `<template data-analog-shell>${body.innerHTML}</template>` +
          '<script>window.__analogShell()</script>',
      );
      this.shellSent = true;
    } else {
      for (const id of this.dirty) {
        const range = ranges.get(id);
        if (!range) continue;
        const fragment = this.document.createElement('div');
        for (
          let node = range.start.nextSibling;
          node && node !== range.end;
          node = node.nextSibling
        ) {
          fragment.appendChild(node.cloneNode(true));
        }
        this.enqueue(
          `<template data-analog-settled="${id}">${fragment.innerHTML}</template>` +
            `<script>window.__analogSettle("${id}")</script>`,
        );
      }
    }
    this.dirty.clear();
  }

  private snapshot(document: Document) {
    const body = document.body.cloneNode(true) as HTMLElement;
    const clones = new Map<Node, Node>();
    function index(original: Node, clone: Node) {
      clones.set(original, clone);
      for (let i = 0; i < original.childNodes.length; i++) {
        index(original.childNodes[i], clone.childNodes[i]);
      }
    }
    index(document.body, body);
    const ranges = new Map<string, { start: Comment; end: Comment }>();
    for (const [id, view] of this.views) {
      const anchor = clones.get(view.anchor);
      if (!anchor?.parentNode) continue;
      const first = clones.get(view.nodes()[0]) ?? anchor;
      const start = document.createComment(`analog-settled:${id}`);
      const end = document.createComment(`/analog-settled:${id}`);
      anchor.parentNode.insertBefore(start, first);
      anchor.parentNode.insertBefore(end, anchor);
      ranges.set(id, { start, end });
    }
    return { body, ranges };
  }
}
