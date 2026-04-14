import {
  ɵCLIENT_RENDER_MODE_FLAG,
  ɵSSR_CONTENT_INTEGRITY_MARKER,
} from '@angular/core';

export function ensureSsrIntegrityMarker(): void {
  // Insert Angular client hydration marker
  // See https://github.com/angular/angular/issues/67785
  if (
    document.body.firstChild?.nodeType !== Node.COMMENT_NODE ||
    document.body.firstChild.textContent !== ɵSSR_CONTENT_INTEGRITY_MARKER
  ) {
    document.body.prepend(
      document.createComment(ɵSSR_CONTENT_INTEGRITY_MARKER),
    );
  }

  if (!document.body.hasAttribute(ɵCLIENT_RENDER_MODE_FLAG)) {
    document.body.setAttribute(ɵCLIENT_RENDER_MODE_FLAG, '');
  }
}
