export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Reduces a fenced code-block info string to a safe language identifier so it
 * cannot break out of the `class="language-..."` attribute it is interpolated
 * into.
 */
export function sanitizeLanguage(lang: string | undefined): string {
  return (lang ?? '').match(/^[a-zA-Z0-9-+#.]*/)?.[0] ?? '';
}
