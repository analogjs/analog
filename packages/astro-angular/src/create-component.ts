import {
  type Binding,
  type ComponentMirror,
  inputBinding,
  outputBinding,
} from '@angular/core';
import { ID_PROP_NAME } from './id.ts';

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
