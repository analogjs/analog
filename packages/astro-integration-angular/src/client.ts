import 'zone.js/dist/zone.js';
import { createApplication } from '@angular/platform-browser';
import { ApplicationRef, NgZone, createComponent } from '@angular/core';
import type { ɵComponentType } from '@angular/core';

export default (element: HTMLElement) => {
  return (
    Component: ɵComponentType<unknown>,
    _props?: unknown,
    _childHTML?: unknown
  ) => {
    createApplication().then((appRef: ApplicationRef) => {
      const zone = appRef.injector.get(NgZone);
      zone.run(() => {
        const componentRef = createComponent(Component, {
          environmentInjector: appRef.injector,
          hostElement: element,
        });
        appRef.attachView(componentRef.hostView);
      });
    });
  };
};
