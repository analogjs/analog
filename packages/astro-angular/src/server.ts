import type {
  EnvironmentProviders,
  Provider,
  ɵComponentType as ComponentType,
} from '@angular/core';
import {
  createComponent,
  reflectComponentType,
  provideZonelessChangeDetection,
  DOCUMENT,
} from '@angular/core';
import {
  provideServerRendering,
  renderApplication,
  ɵSERVER_CONTEXT,
  platformServer,
} from '@angular/platform-server';
import {
  createApplication,
  type BootstrapContext,
} from '@angular/platform-browser';
import {
  createInputBindings,
  getComponentElementTag,
} from './create-component.ts';
import { buildProjectableNodes } from './projection.ts';

function check(
  Component: ComponentType<unknown>,
  _props: Record<string, unknown>,
  _children: unknown,
) {
  return !!reflectComponentType(Component);
}

async function renderToStaticMarkup(
  Component: ComponentType<unknown> & {
    renderProviders: (Provider | EnvironmentProviders)[];
  },
  props: Record<string, unknown>,
  children: unknown,
) {
  const mirror = reflectComponentType(Component);

  if (!mirror) {
    // This should be unreachable: the `check` function verifies that Component is an Angular component.
    throw new Error(Component.name + ' is not an Angular component');
  }

  const elementTag = getComponentElementTag(mirror);

  const platformRef = platformServer();
  const document = platformRef.injector.get(DOCUMENT);
  document.body.innerHTML = `<${elementTag}></${elementTag}>`;

  const hostElement = document.querySelector(elementTag) as Element;
  const projectableNodes = buildProjectableNodes(mirror, children, document);

  const bootstrap = async (context?: BootstrapContext) => {
    const appRef = await createApplication(
      {
        providers: [
          provideServerRendering(),
          { provide: ɵSERVER_CONTEXT, useValue: 'analog' },
          provideZonelessChangeDetection(),
          ...(Component.renderProviders || []),
        ],
      },
      context,
    );

    const componentRef = createComponent(Component, {
      environmentInjector: appRef.injector,
      hostElement,
      projectableNodes,
      bindings: createInputBindings(mirror, props),
    });

    appRef.attachView(componentRef.hostView);
    appRef.components.push(componentRef);

    return appRef;
  };

  const html = await renderApplication(bootstrap, {
    document,
  });

  document.documentElement.innerHTML = html;
  let styleTags = '';

  document.head.childNodes.forEach((node) => {
    if (node.nodeName === 'STYLE') {
      styleTags += (node as HTMLElement).outerHTML;
    }
  });

  const correctedHtml = styleTags + document.body.innerHTML;

  platformRef.destroy();

  return { html: correctedHtml };
}

export default {
  check,
  renderToStaticMarkup,
};
