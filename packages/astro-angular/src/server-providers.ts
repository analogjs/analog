import {
  APP_BOOTSTRAP_LISTENER,
  ApplicationRef,
  type ComponentMirror,
  type ComponentRef,
  inject,
  type Provider,
} from '@angular/core';
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';

/**
 * Provide bootstrap listeners to ensure the rendered state matches the settled component state after applying component inputs.
 * @param mirror The component mirror, to detect component inputs
 * @param props Properties applied to the component in the Astro file
 * @returns A providers array for the server renderer
 */
export function provideBootstrapListener(
  mirror: ComponentMirror<unknown>,
  props: Record<string, unknown>,
): Provider[] {
  return [
    {
      provide: BEFORE_APP_SERIALIZED,
      useFactory: () => {
        const appRef = inject(ApplicationRef);

        return () => {
          // Note: appRef.tick() can cause NG0100 errors here
          appRef.components.forEach((compRef) =>
            compRef.changeDetectorRef.detectChanges(),
          );
        };
      },
      multi: true,
    },
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useValue: (compRef: ComponentRef<unknown>) => {
        if (props) {
          for (const [key, value] of Object.entries(props)) {
            if (
              mirror.inputs.some(({ templateName }) => templateName === key)
            ) {
              compRef.setInput(key, value);
            }
          }
        }
      },
      multi: true,
    },
  ];
}
