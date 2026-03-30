import type {
  ComponentMirror,
  EnvironmentProviders,
  Provider,
  ɵComponentType as ComponentType,
} from '@angular/core';
import {
  ApplicationRef,
  InjectionToken,
  reflectComponentType,
  provideZonelessChangeDetection,
  DOCUMENT,
  APP_ID,
} from '@angular/core';
import {
  BEFORE_APP_SERIALIZED,
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

const ANALOG_ASTRO_STATIC_PROPS = new InjectionToken<{
  props: Record<string, unknown>;
  mirror: ComponentMirror<unknown>;
}>('@analogjs/astro-angular: Static Props w/ Mirror Provider', {
  factory() {
    return { props: {}, mirror: {} as ComponentMirror<unknown> };
  },
});

function check(
  Component: ComponentType<unknown>,
  _props: Record<string, unknown>,
  _children: unknown,
) {
  return !!reflectComponentType(Component);
}

// Run beforeAppInitialized hook to set Input on the ComponentRef
// before the platform renders to string
const STATIC_PROPS_HOOK_PROVIDER: Provider = {
  provide: BEFORE_APP_SERIALIZED,
  useFactory: (
    appRef: ApplicationRef,
    {
      props,
      mirror,
    }: {
      props: Record<string, unknown>;
      mirror: ComponentMirror<unknown>;
    },
  ) => {
    return () => {
      const compRef = appRef.components[0];
      if (compRef && props && mirror) {
        for (const [key, value] of Object.entries(props)) {
          if (
            // we double-check inputs on ComponentMirror
            // because Astro might add additional props
            // that aren't actually Input defined on the Component
            mirror.inputs.some(
              ({ templateName, propName }) =>
                templateName === key || propName === key,
            )
          ) {
            compRef.setInput(key, value);
          }
        }
        compRef.changeDetectorRef.detectChanges();
      }
    };
  },
  deps: [ApplicationRef, ANALOG_ASTRO_STATIC_PROPS],
  multi: true,
};

async function renderToStaticMarkup(
  Component: ComponentType<unknown> & {
    renderProviders: (Provider | EnvironmentProviders)[];
  },
  props: Record<string, unknown>,
  _children: unknown,
) {
  const mirror = reflectComponentType(Component);
  const appId =
    mirror?.selector.split(',')[0] || Component.name.toString().toLowerCase();
  const ngAppId =
    props?.['data-analog-id'] || 'ng-' + Math.random().toString().slice(2, 9);

  const platformRef = platformServer();
  const document = platformRef.injector.get(DOCUMENT);
  document.body.innerHTML = `<${appId} data-analog-id="${ngAppId}"></${appId}>`;

  const bootstrap = (context?: BootstrapContext) =>
    bootstrapApplication(
      Component,
      {
        providers: [
          {
            provide: ANALOG_ASTRO_STATIC_PROPS,
            useValue: { props, mirror },
          },
          STATIC_PROPS_HOOK_PROVIDER,
          provideServerRendering(),
          { provide: ɵSERVER_CONTEXT, useValue: 'analog' },
          provideZonelessChangeDetection(),
          provideClientHydration(),
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
};
