import {
  type EnvironmentProviders,
  type Provider,
  reflectComponentType,
  provideZonelessChangeDetection,
  Type,
  APP_ID,
  createComponent,
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
  registerRootComponent,
} from './create-component.ts';
import { ID_PROP_NAME } from './id.ts';
import { ensureSsrIntegrityMarker } from './ssr-integrity.ts';
import { buildProjectableNodes, collectProjectedNodes } from './projection.ts';

export default (element: HTMLElement) => {
  return (
    Component: Type<unknown> & {
      clientProviders?: (Provider | EnvironmentProviders)[];
      hydrationFeatures?: () => HydrationFeature<HydrationFeatureKind>[];
    },
    props?: Record<string, unknown>,
    slots?: unknown,
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

    // Hydration reuses the server-rendered DOM, so hand Angular the projected
    // nodes it already rendered instead of freshly parsed copies.
    const projectableNodes =
      (reuseDom && ngAppId
        ? collectProjectedNodes(hostElement, mirror, ngAppId)
        : undefined) ?? buildProjectableNodes(mirror, slots, document);

    return createApplication({
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
          projectableNodes,
          bindings: createComponentBindings(mirror, props, hostElement),
        });

        registerRootComponent(appRef, componentRef);

        return appRef;
      })
      .catch((error) => {
        console.error('Failed to hydrate Angular component:', error);
      });
  };
};
