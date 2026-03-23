import {
  Directive,
  ElementRef,
  effect,
  inject,
  input,
  Renderer2,
  ViewContainerRef,
} from '@angular/core';

import { MDC_COMPONENTS } from './mdc-component-registry';

type ComarkNode =
  | string
  | [string | null, Record<string, unknown>, ...ComarkNode[]];

/**
 * Directive that renders MDC (Markdown Components) AST nodes as Angular components.
 *
 * Walks the ComarkTree AST from md4x's `parseAST()`, matches component nodes
 * to the registered MDC_COMPONENTS map, and instantiates them via
 * `ViewContainerRef.createComponent()` with MDC attributes bound as inputs.
 *
 * @experimental MDC component support is experimental and may change in future releases.
 *
 * @example
 * ```html
 * <div [mdcAst]="parsedAst"></div>
 * ```
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: '[mdcAst]',
  standalone: true,
})
export class MdcRendererDirective {
  readonly ast = input<{ nodes: ComarkNode[] } | null>(null, {
    alias: 'mdcAst',
  });

  private readonly viewContainer = inject(ViewContainerRef);
  private readonly renderer = inject(Renderer2);
  private readonly el = inject(ElementRef);
  private readonly components = inject(MDC_COMPONENTS, { optional: true });
  private renderId = 0;

  constructor() {
    effect(() => {
      const ast = this.ast();
      const currentRenderId = ++this.renderId;

      this.viewContainer.clear();
      const host = this.el.nativeElement as HTMLElement;
      host.innerHTML = '';

      if (!ast?.nodes) return;

      // Fire-and-forget: Angular doesn't await effects, so we schedule
      // the async rendering and let it complete in the background.
      void this.renderNodes(ast.nodes, host, currentRenderId);
    });
  }

  private async renderNodes(
    nodes: ComarkNode[],
    parent: HTMLElement,
    renderId: number,
  ): Promise<void> {
    for (const node of nodes) {
      if (this.renderId !== renderId) return;
      await this.renderNode(node, parent, renderId);
    }
  }

  private async renderNode(
    node: ComarkNode,
    parent: HTMLElement,
    renderId: number,
  ): Promise<void> {
    if (this.renderId !== renderId) return;

    if (typeof node === 'string') {
      const text = this.renderer.createText(node);
      this.renderer.appendChild(parent, text);
      return;
    }

    const [tag, props, ...children] = node;

    if (!tag) {
      for (const child of children) {
        if (this.renderId !== renderId) return;
        await this.renderNode(child, parent, renderId);
      }
      return;
    }

    // Check if this tag is a registered MDC component
    const componentLoader = this.components?.get(tag);
    if (componentLoader) {
      try {
        const componentType = await componentLoader();
        if (this.renderId !== renderId) return;

        const tempContainer = this.renderer.createElement('div');
        for (const child of children) {
          if (this.renderId !== renderId) return;
          await this.renderNode(child, tempContainer, renderId);
        }
        if (this.renderId !== renderId) return;

        const projectableNodes = [
          Array.from((tempContainer as HTMLElement).childNodes),
        ];
        const componentRef = this.viewContainer.createComponent(componentType, {
          projectableNodes,
        });

        // Bind MDC attributes as component inputs
        for (const [key, value] of Object.entries(props)) {
          componentRef.setInput(key, value);
        }

        const componentEl = componentRef.location.nativeElement as HTMLElement;
        this.renderer.appendChild(parent, componentEl);
      } catch (e) {
        console.error(`[MdcRenderer] Failed to load component "${tag}":`, e);
      }
      return;
    }

    // Fall back to rendering as a standard HTML element
    const el = this.renderer.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      this.renderer.setAttribute(el, key, String(value));
    }
    for (const child of children) {
      if (this.renderId !== renderId) return;
      await this.renderNode(child, el, renderId);
    }
    this.renderer.appendChild(parent, el);
  }
}
