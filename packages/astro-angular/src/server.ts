import 'zone.js/bundles/zone-node.umd.js';
import type {
  ComponentMirror,
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
  renderApplication,
} from '@angular/platform-server';

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
  Component: ComponentType<unknown>,
  props: Record<string, unknown>,
  _children: unknown
) {
  const mirror = reflectComponentType(Component);
  const appId = mirror?.selector || Component.name.toString().toLowerCase();
  const document = `<${appId}></${appId}>`;

  const html = await renderApplication(Component, {
    appId,
    document,
    providers: [
      {
        provide: ANALOG_ASTRO_STATIC_PROPS,
        useValue: { props, mirror },
      },
      STATIC_PROPS_HOOK_PROVIDER,
    ],
  });

  return { html };
}

export default {
  check,
  renderToStaticMarkup,
};
