import type {
  ComponentMirror,
  EnvironmentProviders,
  Provider,
  Type,
} from '@angular/core';
import {
  reflectComponentType,
  provideZonelessChangeDetection,
  DOCUMENT,
  APP_ID,
  APP_BOOTSTRAP_LISTENER,
  inject,
  ApplicationRef,
} from '@angular/core';
import {
  provideServerRendering,
  renderApplication,
  ɵSERVER_CONTEXT,
  platformServer,
} from '@angular/platform-server';
import {
  bootstrapApplication,
  provideClientHydration,
  type BootstrapContext,
} from '@angular/platform-browser';
import type { AstroComponentMetadata, SSRLoadedRendererValue } from 'astro';
import { getContext, incrementId, RendererContext } from './context.ts';

async function check(
  Component: Type<unknown>,
  _props: Record<string, unknown>,
  _children: unknown,
) {
  return !!reflectComponentType(Component);
}

function provideBootstrapListener(
  mirror: ComponentMirror<unknown>,
  props: Record<string, unknown>,
): Provider {
  return {
    provide: APP_BOOTSTRAP_LISTENER,
    useFactory: () => {
      const appRef = inject(ApplicationRef);

      return () => {
        const compRef = appRef.components[0];
        if (compRef && props && mirror) {
          for (const [key, value] of Object.entries(props)) {
            if (
              mirror.inputs.some(({ templateName }) => templateName === key)
            ) {
              compRef.setInput(key, value);
            }
          }
          compRef.changeDetectorRef.detectChanges();
        }
      };
    },
    multi: true,
  };
}

async function renderToStaticMarkup(
  this: RendererContext,
  Component: Type<unknown> & {
    renderProviders: (Provider | EnvironmentProviders)[];
  },
  props: Record<string, unknown>,
  _children: unknown,
  metadata?: AstroComponentMetadata,
) {
  const mirror = reflectComponentType(Component);

  if (!mirror) {
    // This should be unreachable: the `check` function verifies that Component is an Angular component.
    throw new Error(
      (metadata?.displayName || '<unknown component>') +
        ' is not an Angular component',
    );
  }

  const appId =
    mirror.selector.split(',')[0] || Component.name.toString().toLowerCase();
  const ngAppId =
    props?.['data-analog-id'] || incrementId(getContext(this.result));

  const platformRef = platformServer();
  const document = platformRef.injector.get(DOCUMENT);
  document.body.innerHTML = `<${appId} data-analog-id="${ngAppId}"></${appId}>`;

  const bootstrap = (context?: BootstrapContext) =>
    bootstrapApplication(
      Component,
      {
        providers: [
          provideBootstrapListener(mirror, props),
          provideServerRendering(),
          { provide: ɵSERVER_CONTEXT, useValue: 'analog' },
          provideZonelessChangeDetection(),
          metadata?.hydrate ? provideClientHydration() : [],
          {
            provide: APP_ID,
            useValue: ngAppId,
          },
          ...(Component.renderProviders || []),
        ],
      },
      context,
    );

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
} satisfies SSRLoadedRendererValue;
