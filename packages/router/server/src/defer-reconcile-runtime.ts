/**
 * Tiny client runtime for progressive streaming SSR — EXPERIMENTAL.
 *
 * `renderStream` streams the document in three parts:
 *   1. the head + this runtime + an empty `<div data-analog-stream>` region;
 *   2. each `@defer` block, as it resolves on the server, as a
 *      `<template data-analog-defer="ID">…</template>` followed by a call to
 *      `window.__analogPaint("ID")` — this runtime paints the block into the
 *      streaming region immediately, so content appears progressively and out
 *      of document order;
 *   3. the authoritative, fully hydration-annotated body in a
 *      `<template data-analog-authoritative>` followed by
 *      `window.__analogFinalize()` — this runtime swaps it in, replacing the
 *      progressive preview with the exact document Angular's incremental
 *      hydration expects.
 *
 * Emitted into the document by `renderStream`. Exported as a string so it can
 * be injected verbatim and unit-tested against a DOM.
 */
export const DEFER_RECONCILE_RUNTIME = /* js */ `
(function () {
  function region() {
    return document.querySelector('[data-analog-stream]');
  }
  window.__analogPaint = function (id) {
    var tpl = document.querySelector('template[data-analog-defer="' + id + '"]');
    var r = region();
    if (!tpl || !r) return;
    r.appendChild(tpl.content.cloneNode(true));
    tpl.remove();
  };
  window.__analogFinalize = function () {
    var auth = document.querySelector('template[data-analog-authoritative]');
    if (!auth) return;
    // Replace the entire body — preview region, block templates and runtime
    // scripts — with just the authoritative body, so the reconciled DOM matches
    // a buffered render byte-for-byte before hydration boots.
    document.body.replaceChildren(auth.content.cloneNode(true));
  };
})();
`;
