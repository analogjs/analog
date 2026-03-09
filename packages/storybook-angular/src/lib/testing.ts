import '@angular/compiler';
import type { AngularRenderer } from '@storybook/angular';
import { setProjectAnnotations as originalSetProjectAnnotations } from '@storybook/angular/client';
import {
  NamedOrDefaultProjectAnnotations,
  NormalizedProjectAnnotations,
  RenderContext,
} from 'storybook/internal/types';
import * as configAnnotations from '@storybook/angular/client/config';

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
    ...(Array.isArray(projectAnnotations)
      ? projectAnnotations
      : [projectAnnotations]),
  ]) as NormalizedProjectAnnotations<AngularRenderer>;
}
