import {
  EnvironmentProviders,
  Provider,
  reflectComponentType,
  provideZonelessChangeDetection,
  APP_BOOTSTRAP_LISTENER,
  ComponentRef,
  ComponentMirror,
  Type,
  APP_ID,
} from '@angular/core';
import {
  createApplication,
  provideClientHydration,
} from '@angular/platform-browser';
import { Observable, Subject, takeUntil } from 'rxjs';

function bindInputsAndOutputs(
  element: HTMLElement,
  mirror: ComponentMirror<unknown>,
  props?: Record<string, unknown>,
): (componentRef: ComponentRef<unknown>) => void {
  return (componentRef: ComponentRef<unknown>) => {
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (
          mirror.inputs.some(
            ({ templateName, propName }) =>
              templateName === key || propName === key,
          )
        ) {
          componentRef.setInput(key, value);
        }
      }
    }

    if (mirror.outputs.length && props?.['data-analog-id']) {
      const destroySubject = new Subject<void>();
      element.setAttribute('data-analog-id', props['data-analog-id'] as string);

      mirror.outputs.forEach(({ templateName, propName }) => {
        const outputName = templateName || propName;
        const component = componentRef.instance as Record<
          string,
          Observable<unknown>
        >;
        component[outputName]
          .pipe(takeUntil(destroySubject))
          .subscribe((detail) => {
            const event = new CustomEvent(outputName, {
              bubbles: true,
              cancelable: true,
              composed: true,
              detail,
            });
            element.dispatchEvent(event);
          });
      });

      componentRef.onDestroy(() => {
        destroySubject.next();
        destroySubject.complete();
      });
    }
  };
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
    document.body.prepend(document.createComment('nghm'));

    const hostElement = element.querySelector(mirror.selector);

    const ngAppId = hostElement?.getAttribute('data-analog-id');

    createApplication({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: APP_BOOTSTRAP_LISTENER,
          useFactory: () => bindInputsAndOutputs(element, mirror, props),
          multi: true,
        },
        // Provide client hydration _after_ our listener so we bind the inputs first
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
      appRef.bootstrap(Component, hostElement);
    });
  };
};
