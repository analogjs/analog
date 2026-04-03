import {
  type EnvironmentProviders,
  type Provider,
  reflectComponentType,
  provideZonelessChangeDetection,
  Type,
  APP_ID,
  createComponent,
  ɵCLIENT_RENDER_MODE_FLAG,
  ɵSSR_CONTENT_INTEGRITY_MARKER,
  APP_BOOTSTRAP_LISTENER,
} from '@angular/core';
import {
  createApplication,
  type HydrationFeature,
  type HydrationFeatureKind,
  provideClientHydration,
} from '@angular/platform-browser';
import { createComponentBindings } from './create-component.ts';
import { ID_PROP_NAME } from './id.ts';

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

    // Insert Angular client hydration marker
    // See https://github.com/angular/angular/issues/67785
    document.body.prepend(
      document.createComment(ɵSSR_CONTENT_INTEGRITY_MARKER),
    );
    document.body.setAttribute(ɵCLIENT_RENDER_MODE_FLAG, '');

    const hostElement = element.querySelector(mirror.selector);

    if (!hostElement) {
      throw new Error(
        'No host element found for hydration! Selector: ' + mirror.selector,
      );
    }

    const ngAppId = hostElement?.getAttribute(ID_PROP_NAME);

    createApplication({
      providers: [
        provideZonelessChangeDetection(),
        provideClientHydration(...(Component.hydrationFeatures?.() || [])),
        {
          provide: APP_ID,
          useValue: ngAppId || 'ng',
        },
        ...(Component.clientProviders || []),
      ],
    }).then((appRef) => {
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
    });
  };
};
