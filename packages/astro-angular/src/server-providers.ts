import {
  APP_BOOTSTRAP_LISTENER,
  type ComponentMirror,
  type ComponentRef,
  type Provider,
} from '@angular/core';

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
