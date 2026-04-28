import {
  reflectComponentType,
  type ComponentMirror,
  type Type,
} from '@angular/core';
import {
  argsToTemplate,
  componentWrapperDecorator as originalComponentWrapperDecorator,
  type AngularRenderer,
  type IStory,
  type StoryContext,
} from '@storybook/angular';
import type { DecoratorFunction } from 'storybook/internal/types';

type StoryProps = Record<string, unknown>;

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'command',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export function componentWrapperDecorator<TArgs = any>(
  element: Type<unknown> | ((story: string) => string),
  props?: StoryProps | ((storyContext: StoryContext<TArgs>) => StoryProps),
): DecoratorFunction<AngularRenderer, TArgs> {
  const decorator = originalComponentWrapperDecorator(element, props);

  return (storyFn, storyContext) =>
    decorator(() => ensureStoryTemplate(storyFn(), storyContext), storyContext);
}

function ensureStoryTemplate<TArgs>(
  story: IStory,
  storyContext: StoryContext<TArgs>,
): IStory {
  if (story.template || !storyContext.component) {
    return story;
  }

  const component = reflectComponentType(
    storyContext.component as Type<unknown>,
  );

  if (!component) {
    return story;
  }

  return {
    ...story,
    template: createTemplate(component, story.props ?? storyContext.args),
    userDefinedTemplate: false,
  };
}

function createTemplate(
  component: ComponentMirror<unknown>,
  props: unknown,
): string {
  const selector = component.selector.split(',')[0]?.trim();
  if (!selector) {
    return '<ng-container *ngComponentOutlet="storyComponent"></ng-container>';
  }

  const bindings = filterTemplateBindings(component, props);
  const attributes = argsToTemplate(bindings);

  return buildTemplate(selector, attributes);
}

function filterTemplateBindings(
  component: ComponentMirror<unknown>,
  props: unknown,
): StoryProps {
  if (!props || typeof props !== 'object') {
    return {};
  }

  const supportedBindings = new Set([
    ...component.inputs.map((input) => input.templateName),
    ...component.outputs.map((output) => output.templateName),
  ]);

  return Object.fromEntries(
    Object.entries(props).filter(([key, value]) => {
      return value !== undefined && supportedBindings.has(key);
    }),
  );
}

function buildTemplate(selector: string, attributes: string): string {
  const elementMatch = selector.match(/^[A-Za-z][\w-]*/);
  const tagName = elementMatch?.[0] ?? 'div';
  const id = selector.match(/#([\w-]+)/)?.[1];
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(
    (match) => match[1],
  );
  const selectorAttributes = [...selector.matchAll(/\[([^\]]+)\]/g)].map(
    (match) => match[1].trim(),
  );
  const parts = [
    id ? `id="${id}"` : '',
    classes.length > 0 ? `class="${classes.join(' ')}"` : '',
    ...selectorAttributes,
    attributes,
  ].filter(Boolean);
  const openingTag =
    parts.length > 0 ? `<${tagName} ${parts.join(' ')}>` : `<${tagName}>`;

  if (VOID_ELEMENTS.has(tagName)) {
    return openingTag.replace(/>$/, ' />');
  }

  return `${openingTag}</${tagName}>`;
}
