import 'zone.js/dist/zone.js';
import type { ɵComponentType as ComponentType } from '@angular/core';
import { ApplicationRef, NgZone, createComponent } from '@angular/core';
import { createApplication } from '@angular/platform-browser';

export default (element: HTMLElement) => {
  return (
    Component: ComponentType<unknown>,
    _props?: Record<string, unknown>,
    _childHTML?: unknown
  ) => {
    createApplication().then((appRef: ApplicationRef) => {
      const zone = appRef.injector.get(NgZone);
      zone.run(() => {
        const componentRef = createComponent(Component, {
          environmentInjector: appRef.injector,
          hostElement: element,
        });

        if (_props) {
          for (const [key, value] of Object.entries(_props)) {
            componentRef.setInput(key, value);
          }
        }

        appRef.attachView(componentRef.hostView);
      });
    });
  };
};
