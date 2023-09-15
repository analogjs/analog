import 'zone.js';
import {
  EnvironmentProviders,
  Provider,
  reflectComponentType,
  ɵComponentType as ComponentType,
} from '@angular/core';
import { ApplicationRef, NgZone, createComponent } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { Observable, Subject, takeUntil } from 'rxjs';

export default (element: HTMLElement) => {
  return (
    Component: ComponentType<unknown> & {
      clientProviders?: (Provider | EnvironmentProviders)[];
    },
    props?: Record<string, unknown>,
    _childHTML?: unknown
  ) => {
    createApplication({
      providers: [...(Component.clientProviders || [])],
    }).then((appRef: ApplicationRef) => {
      const zone = appRef.injector.get(NgZone);
      zone.run(() => {
        const componentRef = createComponent(Component, {
          environmentInjector: appRef.injector,
          hostElement: element,
        });

        const mirror = reflectComponentType(Component);
        if (props && mirror) {
          for (const [key, value] of Object.entries(props)) {
            if (
              mirror.inputs.some(
                ({ templateName, propName }) =>
                  templateName === key || propName === key
              )
            ) {
              componentRef.setInput(key, value);
            }
          }
        }

        if (mirror?.outputs.length && props?.['data-analog-id']) {
          const destroySubject = new Subject<void>();
          element.setAttribute(
            'data-analog-id',
            props['data-analog-id'] as string
          );

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

          appRef.onDestroy(() => {
            destroySubject.next();
            destroySubject.complete();
          });
        }

        appRef.attachView(componentRef.hostView);
      });
    });
  };
};
