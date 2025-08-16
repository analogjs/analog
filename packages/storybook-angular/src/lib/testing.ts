import type { AngularRenderer } from '@storybook/angular';
import { setProjectAnnotations as originalSetProjectAnnotations } from '@storybook/angular/dist/client/index.mjs';
import {
  NamedOrDefaultProjectAnnotations,
  NormalizedProjectAnnotations,
  RenderContext,
} from 'storybook/internal/types';
import * as configAnnotations from '@storybook/angular/dist/client/config.mjs';

export const render = configAnnotations.render;

export async function renderToCanvas(
  context: RenderContext<AngularRenderer>,
  element: HTMLElement,
) {
  element.id = context.id;
  await configAnnotations.renderToCanvas(context, element);
}

const renderAnnotations = {
  render,
  renderToCanvas,
};

export function setProjectAnnotations(
  projectAnnotations:
    | NamedOrDefaultProjectAnnotations<any>
    | NamedOrDefaultProjectAnnotations<any>[],
): NormalizedProjectAnnotations<AngularRenderer> {
  return originalSetProjectAnnotations([
    renderAnnotations,
    projectAnnotations,
  ]) as NormalizedProjectAnnotations<AngularRenderer>;
}
