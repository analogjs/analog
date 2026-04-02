import {
  EnvironmentProviders,
  Provider,
  reflectComponentType,
  provideZonelessChangeDetection,
  ComponentMirror,
  Type,
  APP_ID,
  createComponent,
  Binding,
  inputBinding,
  outputBinding,
  APP_BOOTSTRAP_LISTENER,
} from '@angular/core';
import {
  createApplication,
  provideClientHydration,
} from '@angular/platform-browser';

function createBindings(
  element: HTMLElement,
  mirror: ComponentMirror<unknown>,
  props?: Record<string, unknown>,
): Binding[] {
  if (!props) {
    return [];
  }

  const inputBindings = Object.entries(props)
    .filter(([key]) =>
      mirror.inputs.some(({ templateName }) => templateName === key),
    )
    .map(([key, value]) => inputBinding(key, () => value));

  if (!mirror.outputs.length || !props['data-analog-id']) {
    return inputBindings;
  }

  const outputBindings = mirror.outputs.map(({ templateName }) =>
    outputBinding(templateName, (detail) => {
      const event = new CustomEvent(templateName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      });
      element.dispatchEvent(event);
    }),
  );

  return [...inputBindings, ...outputBindings];
}

export default (element: HTMLElement) => {
  return (
    Component: Type<unknown> & {
      clientProviders?: (Provider | EnvironmentProviders)[];
    },
    props?: Record<string, unknown>,
    _childHTML?: unknown,
  ) => {
    const mirror = reflectComponentType(Component);

    if (!mirror) {
      // Not an Angular component
      return;
    }

    // Insert Angular client hydration marker
    // See https://github.com/angular/angular/issues/67785
    document.body.prepend(document.createComment('nghm'));

    const hostElement = element.querySelector(mirror.selector);

    if (!hostElement) {
      throw new Error(
        'No host element found for hydration! Selector: ' + mirror.selector,
      );
    }

    const ngAppId = hostElement?.getAttribute('data-analog-id');

    createApplication({
      providers: [
        provideZonelessChangeDetection(),
        provideClientHydration(),
        ngAppId
          ? {
              provide: APP_ID,
              useValue: ngAppId,
            }
          : [],
        ...(Component.clientProviders || []),
      ],
    }).then((appRef) => {
      const componentRef = createComponent(Component, {
        environmentInjector: appRef.injector,
        hostElement,
        bindings: createBindings(element, mirror, props),
      });

      componentRef.onDestroy(() => {
        appRef.detachView(componentRef.hostView);
      });

      appRef.attachView(componentRef.hostView);

      appRef.injector
        .get(APP_BOOTSTRAP_LISTENER, [])
        .forEach((cb) => cb(componentRef));
    });
  };
};
