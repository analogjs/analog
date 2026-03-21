import {
  Directive,
  ElementRef,
  inject,
  Input,
  OnChanges,
  Optional,
  Renderer2,
  SimpleChanges,
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
export class MdcRendererDirective implements OnChanges {
  @Input('mdcAst') ast: { nodes: ComarkNode[] } | null = null;

  private readonly viewContainer = inject(ViewContainerRef);
  private readonly renderer = inject(Renderer2);
  private readonly el = inject(ElementRef);
  private readonly components = inject(MDC_COMPONENTS, { optional: true });

  ngOnChanges(_changes: SimpleChanges): void {
    this.viewContainer.clear();
    const host = this.el.nativeElement as HTMLElement;
    host.innerHTML = '';

    if (!this.ast?.nodes) return;

    // Fire-and-forget: Angular doesn't await ngOnChanges, so we schedule
    // the async rendering and let it complete in the background.
    void this.renderNodes(this.ast.nodes, host);
  }

  private async renderNodes(
    nodes: ComarkNode[],
    parent: HTMLElement,
  ): Promise<void> {
    for (const node of nodes) {
      await this.renderNode(node, parent);
    }
  }

  private async renderNode(
    node: ComarkNode,
    parent: HTMLElement,
  ): Promise<void> {
    if (typeof node === 'string') {
      const text = this.renderer.createText(node);
      this.renderer.appendChild(parent, text);
      return;
    }

    const [tag, props, ...children] = node;

    if (!tag) {
      for (const child of children) {
        await this.renderNode(child, parent);
      }
      return;
    }

    // Check if this tag is a registered MDC component
    const componentLoader = this.components?.get(tag);
    if (componentLoader) {
      const componentType = await componentLoader();
      const componentRef = this.viewContainer.createComponent(componentType);

      // Bind MDC attributes as component inputs
      for (const [key, value] of Object.entries(props)) {
        componentRef.setInput(key, value);
      }

      // Render children into the component's host element
      const componentEl = componentRef.location.nativeElement as HTMLElement;
      for (const child of children) {
        await this.renderNode(child, componentEl);
      }

      this.renderer.appendChild(parent, componentEl);
      return;
    }

    // Fall back to rendering as a standard HTML element
    const el = this.renderer.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      this.renderer.setAttribute(el, key, String(value));
    }
    for (const child of children) {
      await this.renderNode(child, el);
    }
    this.renderer.appendChild(parent, el);
  }
}
