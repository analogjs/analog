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
 *   3. the authoritative document tail: the app's resolved `<head>` in a
 *      `<template data-analog-head>` and the hydration-annotated body in a
 *      `<template data-analog-authoritative>`, followed by
 *      `window.__analogReconcileHead()` + `window.__analogFinalize()`. The head
 *      is reconciled first (a dynamically-set `<title>`/meta is applied to the
 *      live document, since the streamed shell head was flushed before the app
 *      ran), then the body is swapped to the exact document Angular's
 *      incremental hydration expects.
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
  window.__analogReconcileHead = function () {
    // The shell head was flushed before the app rendered, so any title/meta the
    // app set during render (Title/Meta services, route meta) is missing from
    // the live document. Apply the authoritative head here, before hydration —
    // matching how a buffered render would have produced the head. Idempotent:
    // tags already present (charset, viewport, stylesheet/preload links) are
    // matched and left as-is; only changed/added ones are updated.
    var tpl = document.querySelector('template[data-analog-head]');
    if (!tpl) return;
    var frag = tpl.content;
    var head = document.head;
    var title = frag.querySelector('title');
    if (title) document.title = title.textContent || '';
    function metaKey(m) {
      if (m.hasAttribute('charset')) return 'charset';
      var attrs = ['name', 'property', 'http-equiv', 'itemprop'];
      for (var i = 0; i < attrs.length; i++) {
        if (m.hasAttribute(attrs[i])) return attrs[i] + '=' + m.getAttribute(attrs[i]);
      }
      return null;
    }
    var existingMeta = {};
    var metas = head.querySelectorAll('meta');
    for (var i = 0; i < metas.length; i++) {
      var k = metaKey(metas[i]);
      if (k) existingMeta[k] = metas[i];
    }
    frag.querySelectorAll('meta').forEach(function (m) {
      var key = metaKey(m);
      if (key == null) return;
      if (existingMeta[key]) existingMeta[key].replaceWith(m.cloneNode(true));
      else head.appendChild(m.cloneNode(true));
    });
    var existingHref = {};
    var links = head.querySelectorAll('link[href]');
    for (var j = 0; j < links.length; j++) {
      existingHref[links[j].getAttribute('href')] = true;
    }
    frag.querySelectorAll('link').forEach(function (l) {
      var href = l.getAttribute('href');
      if (href && existingHref[href]) return;
      head.appendChild(l.cloneNode(true));
      if (href) existingHref[href] = true;
    });
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
