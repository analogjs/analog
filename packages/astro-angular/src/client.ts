import 'zone.js/dist/zone.js';
import {
  EnvironmentProviders,
  Provider,
  reflectComponentType,
  ɵComponentType as ComponentType,
} from '@angular/core';
import { ApplicationRef, NgZone, createComponent } from '@angular/core';
import { createApplication } from '@angular/platform-browser';

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

        appRef.attachView(componentRef.hostView);
      });
    });
  };
};
