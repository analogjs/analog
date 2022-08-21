import 'zone.js/dist/zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { ɵComponentType } from '@angular/core';

export default (_element?: HTMLElement) => {
  return (
    Component: ɵComponentType<unknown>,
    _props?: unknown,
    _childHTML?: unknown
  ) => {
    bootstrapApplication(Component);
  };
};
