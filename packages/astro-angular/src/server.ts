import 'zone.js/node';
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
} from '@angular/core';
import {
  BEFORE_APP_SERIALIZED,
  provideServerRendering,
  renderApplication,
  ɵSERVER_CONTEXT,
} from '@angular/platform-server';
import { bootstrapApplication } from '@angular/platform-browser';

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
  _children: unknown
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
    }
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
                templateName === key || propName === key
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
  _children: unknown
) {
  const mirror = reflectComponentType(Component);
  const appId =
    mirror?.selector.split(',')[0] || Component.name.toString().toLowerCase();
  const document = `<${appId}></${appId}>`;
  const bootstrap = () =>
    bootstrapApplication(Component, {
      providers: [
        {
          provide: ANALOG_ASTRO_STATIC_PROPS,
          useValue: { props, mirror },
        },
        STATIC_PROPS_HOOK_PROVIDER,
        provideServerRendering(),
        { provide: ɵSERVER_CONTEXT, useValue: 'analog' },
        ...(Component.renderProviders || []),
      ],
    });

  const html = await renderApplication(bootstrap, {
    document,
  });

  return { html };
}

export default {
  check,
  renderToStaticMarkup,
};
