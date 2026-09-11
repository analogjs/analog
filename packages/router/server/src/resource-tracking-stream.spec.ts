import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceTrackingStream } from './resource-tracking-stream';
import { DEFER_RECONCILE_RUNTIME } from './defer-reconcile-runtime';

describe('resource tracking stream previews', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('streams a shell then replaces nested ranges in place without changing the server DOM', () => {
    const server = document.implementation.createHTMLDocument();
    server.body.innerHTML = '<h1>Dashboard</h1><p>Loading</p><!--outer-->';
    const outer = server.body.lastChild!;
    const chunks: string[] = [];
    const stream = new ResourceTrackingStream((html) => chunks.push(html));
    const parent = stream.register({
      anchor: outer,
      nodes: () => [server.body.children[1]],
    });
    stream.start(server);
    vi.runAllTimers();
    expect(chunks[0]).toContain('data-analog-shell');
    expect(chunks[0]).toContain('Loading');
    expect(server.body.innerHTML).not.toContain('analog-settled:');

    const section = server.createElement('section');
    section.innerHTML = '<h2>Ada</h2><p>Loading activity</p><!--inner-->';
    server.body.children[1].replaceWith(section);
    const child = stream.register({
      anchor: section.lastChild!,
      nodes: () => [section.children[1]],
    });
    parent.update();
    vi.runAllTimers();
    const parentChunk = chunks.find((html) =>
      html.includes('data-analog-settled="u0"'),
    )!;
    expect(parentChunk).toContain('Ada');
    expect(parentChunk).toContain('Loading activity');
    expect(parentChunk).toContain('analog-settled:u1');

    // Execute the same templates and scripts the browser receives.
    document.body.innerHTML = '<div data-analog-stream></div>';
    new Function(DEFER_RECONCILE_RUNTIME)();
    const paint = (html: string) => {
      const template = document.createElement('template');
      template.innerHTML = html;
      document.body.append(template.content);
      for (const script of document.body.querySelectorAll(':scope > script')) {
        new Function(script.textContent!)();
        script.remove();
      }
    };
    chunks.forEach(paint);
    const profile = document.querySelector('h2');
    expect(profile?.textContent).toBe('Ada');

    chunks.length = 0;
    section.children[1].textContent = 'Activity failed';
    child.update();
    vi.runAllTimers();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).not.toContain('Ada');
    paint(chunks[0]);
    expect(document.querySelector('section')?.textContent).toBe(
      'AdaActivity failed',
    );
    expect(document.querySelector('h2')).toBe(profile);
    expect(server.body.innerHTML).not.toContain('analog-settled:');
    stream.finish();
  });

  it('handles nested template ranges that share the same first native node', () => {
    const server = document.implementation.createHTMLDocument();
    server.body.innerHTML = '<p>Ready</p><!--inner--><!--outer-->';
    const chunks: string[] = [];
    const stream = new ResourceTrackingStream((html) => chunks.push(html));
    stream.register({
      anchor: server.body.lastChild!,
      nodes: () => [server.body.firstChild!],
    });
    stream.register({
      anchor: server.body.childNodes[1],
      nodes: () => [server.body.firstChild!],
    });
    stream.start(server);
    stream.finish();
    expect(chunks[0]).toContain(
      '<!--analog-settled:u0--><!--analog-settled:u1--><p>Ready</p><!--/analog-settled:u1--><!--inner--><!--/analog-settled:u0-->',
    );
  });

  it('includes an already settled hidden child when its parent reveals', () => {
    const server = document.implementation.createHTMLDocument();
    server.body.innerHTML = '<p>Loading dashboard</p><!--outer-->';
    const content = server.createElement('section');
    content.innerHTML = '<p>Loading activity</p><!--inner-->';
    const chunks: string[] = [];
    const stream = new ResourceTrackingStream((html) => chunks.push(html));
    const parent = stream.register({
      anchor: server.body.lastChild!,
      nodes: () => [server.body.firstChild!],
    });
    const child = stream.register({
      anchor: content.lastChild!,
      nodes: () => [content.firstChild!],
    });
    stream.start(server);
    vi.runAllTimers();
    content.firstChild!.textContent = 'Activity ready';
    child.update();
    vi.runAllTimers();
    expect(chunks).toHaveLength(1);
    server.body.firstChild!.replaceWith(content);
    parent.update();
    stream.finish();
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toContain('data-analog-settled="u0"');
    expect(chunks[1]).toContain('Activity ready');
    expect(chunks[1]).toContain('analog-settled:u1');
    expect(chunks[1]).not.toContain('Loading activity');
  });

  it('isolates concurrent requests and stops scheduling after cleanup', () => {
    const make = (value: string) => {
      const doc = document.implementation.createHTMLDocument();
      doc.body.innerHTML = `<p>${value}</p><!--scope-->`;
      const enqueue = vi.fn();
      const stream = new ResourceTrackingStream(enqueue);
      const view = stream.register({
        anchor: doc.body.lastChild!,
        nodes: () => [doc.body.firstChild!],
      });
      stream.start(doc);
      return { stream, view, enqueue };
    };
    const first = make('First request');
    const second = make('Second request');
    vi.runAllTimers();
    expect(first.enqueue.mock.calls[0][0]).not.toContain('Second request');
    expect(second.enqueue.mock.calls[0][0]).not.toContain('First request');
    first.stream.stop();
    first.view.update();
    second.view.destroy();
    second.stream.finish();
    vi.runAllTimers();
    expect(first.enqueue).toHaveBeenCalledTimes(1);
    expect(second.enqueue).toHaveBeenCalledTimes(1);
  });
});
