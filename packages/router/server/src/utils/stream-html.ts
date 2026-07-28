/**
 * Pure string helpers for slicing a fully rendered SSR document into the parts
 * the streaming renderer flushes: the shell up to `<body>`, the authoritative
 * `<body>` inner HTML for the tail, and the authoritative `<head>` inner HTML
 * for the finalize-time head reconcile. Extracted from `render-stream` so they
 * can be unit tested without driving the platform.
 */

/** Byte offset just after the opening `<body>` tag, or 0 if none. */
export function afterBodyOpen(html: string): number {
  const m = /<body[^>]*>/i.exec(html);
  return m ? m.index + m[0].length : 0;
}

/** Inner HTML of `<body>` from a fully rendered document string. */
export function bodyInner(html: string): string {
  const start = afterBodyOpen(html);
  const end = html.lastIndexOf('</body>');
  return html.slice(start, end > -1 ? end : html.length);
}

/** Inner HTML of `<head>` from a fully rendered document string. */
export function headInner(html: string): string {
  const open = /<head[^>]*>/i.exec(html);
  if (!open) return '';
  const start = open.index + open[0].length;
  const end = html.indexOf('</head>', start);
  return html.slice(start, end > -1 ? end : start);
}
