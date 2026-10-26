import {
  EnvironmentProviders,
  Provider,
  reflectComponentType,
  ɵComponentType as ComponentType,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ApplicationRef, createComponent } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import {
  createComponentBindings,
  registerRootComponent,
} from './create-component.ts';
import { ID_PROP_NAME } from './id.ts';
import { buildProjectableNodes } from './projection.ts';

export default (
  element: HTMLElement,
): ((
  Component: ComponentType<unknown> & {
    clientProviders?: (Provider | EnvironmentProviders)[];
  },
  props?: Record<string, unknown>,
  slots?: unknown,
) => Promise<ApplicationRef | void> | undefined) => {
  return (
    Component: ComponentType<unknown> & {
      clientProviders?: (Provider | EnvironmentProviders)[];
    },
    props?: Record<string, unknown>,
    slots?: unknown,
  ): Promise<ApplicationRef | void> | undefined => {
    const mirror = reflectComponentType(Component);

    if (!mirror) {
      // Not an Angular component
      return;
    }

    if (mirror.outputs.length && props?.[ID_PROP_NAME]) {
      // `addOutputListener` waits for this attribute to attach its listener.
      element.setAttribute(ID_PROP_NAME, props[ID_PROP_NAME] as string);
    }

    return createApplication({
      providers: [
        provideZonelessChangeDetection(),
        ...(Component.clientProviders || []),
      ],
    })
      .then((appRef: ApplicationRef) => {
        // Bindings go through `inputBinding`/`outputBinding`, which handle
        // aliases as well as signal `input()` and `output()`.
        const componentRef = createComponent(Component, {
          environmentInjector: appRef.injector,
          hostElement: element,
          projectableNodes: buildProjectableNodes(mirror, slots, document),
          bindings: createComponentBindings(mirror, props, element),
        });

        registerRootComponent(appRef, componentRef);

        return appRef;
      })
      .catch((error) => {
        console.error('Failed to bootstrap Angular component:', error);
      });
  };
};
