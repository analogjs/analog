/**
 * Custom SharedStylesHost for string-based SSR.
 *
 * Collects component styles in memory instead of appending <style>
 * elements to the DOM. After the render pass, styles are injected
 * into the shim document's <head> for serialization.
 */

import { OnDestroy } from '@angular/core';
import { ShimDocument, ShimElement } from './dom-shim';

export class ServerSharedStylesHost implements OnDestroy {
  private inlineStyles = new Map<string, number>();
  private externalUrls = new Map<string, number>();

  constructor(
    private readonly doc: ShimDocument,
    private readonly appId: string,
    private readonly nonce?: string | null,
  ) {}

  addStyles(styles: string[], urls?: string[]): void {
    if (styles) {
      for (const style of styles) {
        const count = this.inlineStyles.get(style) ?? 0;
        this.inlineStyles.set(style, count + 1);
      }
    }
    if (urls) {
      for (const url of urls) {
        const count = this.externalUrls.get(url) ?? 0;
        this.externalUrls.set(url, count + 1);
      }
    }
  }

  removeStyles(styles: string[], urls?: string[]): void {
    if (styles) {
      for (const style of styles) {
        const count = this.inlineStyles.get(style) ?? 0;
        if (count <= 1) {
          this.inlineStyles.delete(style);
        } else {
          this.inlineStyles.set(style, count - 1);
        }
      }
    }
    if (urls) {
      for (const url of urls) {
        const count = this.externalUrls.get(url) ?? 0;
        if (count <= 1) {
          this.externalUrls.delete(url);
        } else {
          this.externalUrls.set(url, count - 1);
        }
      }
    }
  }

  addHost(_hostNode: any): void {
    // No-op — we don't track host nodes for shadow DOM
  }

  removeHost(_hostNode: any): void {
    // No-op
  }

  ngOnDestroy(): void {
    this.inlineStyles.clear();
    this.externalUrls.clear();
  }

  /**
   * Inject collected styles into the shim document's <head>.
   * Call this after the render pass, before document serialization.
   */
  injectStyles(): void {
    // Inline styles
    for (const [styleContent] of this.inlineStyles) {
      const styleEl = this.doc.createElement('style');
      if (this.nonce) {
        styleEl.setAttribute('nonce', this.nonce);
      }
      const textNode = this.doc.createTextNode(styleContent);
      styleEl.appendChild(textNode);
      this.doc.head.appendChild(styleEl);
    }

    // External stylesheets
    for (const [url] of this.externalUrls) {
      const linkEl = this.doc.createElement('link');
      linkEl.setAttribute('rel', 'stylesheet');
      linkEl.setAttribute('href', url);
      if (this.nonce) {
        linkEl.setAttribute('nonce', this.nonce);
      }
      this.doc.head.appendChild(linkEl);
    }
  }

  /** Get all collected inline styles */
  getStyles(): string[] {
    return [...this.inlineStyles.keys()];
  }

  /** Get all collected external URLs */
  getUrls(): string[] {
    return [...this.externalUrls.keys()];
  }
}
