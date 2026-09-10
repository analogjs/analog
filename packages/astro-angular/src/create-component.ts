import {
  APP_BOOTSTRAP_LISTENER,
  type ApplicationRef,
  type Binding,
  type ComponentMirror,
  type ComponentRef,
  inputBinding,
  outputBinding,
} from '@angular/core';
import { ID_PROP_NAME } from './id.ts';

export function getComponentElementTag(
  mirror: ComponentMirror<unknown>,
): string {
  return mirror.selector.split(',')[0] || 'ng-component';
}

export function createInputBindings(
  mirror: ComponentMirror<unknown>,
  props?: Record<string, unknown>,
): Binding[] {
  if (!props) {
    return [];
  }

  const inputBindings = Object.entries(props)
    .filter(([key]) =>
      mirror.inputs.some(({ templateName }) => templateName === key),
    )
    .map(([key, value]) => inputBinding(key, () => value));

  return inputBindings;
}

export function createOutputBindings(
  hostElement: Element,
  mirror: ComponentMirror<unknown>,
): Binding[] {
  const outputBindings = mirror.outputs.map(({ templateName }) =>
    outputBinding(templateName, (detail) => {
      const event = new CustomEvent(templateName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      });
      hostElement.dispatchEvent(event);
    }),
  );

  return outputBindings;
}

export function createComponentBindings(
  mirror: ComponentMirror<unknown>,
  props?: Record<string, unknown>,
  hostElement?: Element,
): Binding[] {
  const inputBindings = createInputBindings(mirror, props);

  if (!mirror.outputs.length || !props?.[ID_PROP_NAME] || !hostElement) {
    return inputBindings;
  }

  const outputBindings = createOutputBindings(hostElement, mirror);

  return [...inputBindings, ...outputBindings];
}

/**
 * Registers a component created with `createComponent` as a root component,
 * the way `bootstrapApplication` does: attach the view, track it on the
 * application and notify `APP_BOOTSTRAP_LISTENER`s such as the router's.
 */
export function registerRootComponent(
  appRef: ApplicationRef,
  componentRef: ComponentRef<unknown>,
): void {
  appRef.attachView(componentRef.hostView);
  appRef.components.push(componentRef);
  appRef.injector
    .get(APP_BOOTSTRAP_LISTENER, [])
    .forEach((listener) => listener(componentRef));
}
