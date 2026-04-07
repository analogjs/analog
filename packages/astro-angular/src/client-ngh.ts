import {
  type EnvironmentProviders,
  type Provider,
  reflectComponentType,
  provideZonelessChangeDetection,
  Type,
  APP_ID,
  createComponent,
  APP_BOOTSTRAP_LISTENER,
} from '@angular/core';
import {
  createApplication,
  type HydrationFeature,
  type HydrationFeatureKind,
  provideClientHydration,
} from '@angular/platform-browser';
import {
  createComponentBindings,
  getComponentElementTag,
} from './create-component.ts';
import { ID_PROP_NAME } from './id.ts';
import { ensureSsrIntegrityMarker } from './ssr-integrity.ts';

export default (element: HTMLElement) => {
  return (
    Component: Type<unknown> & {
      clientProviders?: (Provider | EnvironmentProviders)[];
      hydrationFeatures?: () => HydrationFeature<HydrationFeatureKind>[];
    },
    props?: Record<string, unknown>,
  ) => {
    const mirror = reflectComponentType(Component);

    if (!mirror) {
      // Not an Angular component
      return;
    }

    ensureSsrIntegrityMarker();

    let hostElement = element.querySelector(mirror.selector);
    let reuseDom = true;

    if (!hostElement) {
      // This is a client-only component
      hostElement = document.createElement(getComponentElementTag(mirror));
      element.appendChild(hostElement);
      reuseDom = false;
    }

    const ngAppId = hostElement?.getAttribute(ID_PROP_NAME);

    createApplication({
      providers: [
        provideZonelessChangeDetection(),
        reuseDom
          ? provideClientHydration(...(Component.hydrationFeatures?.() || []))
          : [],
        {
          provide: APP_ID,
          useValue: ngAppId || 'ng',
        },
        ...(Component.clientProviders || []),
      ],
    })
      .then((appRef) => {
        const componentRef = createComponent(Component, {
          environmentInjector: appRef.injector,
          hostElement,
          bindings: createComponentBindings(mirror, props, hostElement),
        });

        appRef.attachView(componentRef.hostView);

        appRef.components.push(componentRef);

        appRef.injector
          .get(APP_BOOTSTRAP_LISTENER, [])
          .forEach((cb) => cb(componentRef));
      })
      .catch((error) => {
        console.error('Failed to hydrate Angular component:', error);
      });
  };
};
