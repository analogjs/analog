import {
  assertInInjectionContext,
  inject,
  InjectionToken,
  makeStateKey,
  Provider,
  TransferState,
} from '@angular/core';

export const STATIC_PROPS: InjectionToken<Record<string, any>> =
  new InjectionToken<Record<string, any>>('Static Props');

export function provideStaticProps<T = Record<string, any>>(
  props: T,
): Provider {
  return {
    provide: STATIC_PROPS,
    useFactory() {
      return props;
    },
  };
}

export function injectStaticProps(): Record<string, any> {
  assertInInjectionContext(injectStaticProps);

  return inject(STATIC_PROPS);
}

export function injectStaticOutputs<T>(): { set(data: T): void } {
  const transferState = inject(TransferState);
  const outputsKey = makeStateKey<T>('_analog_output');

  return {
    set(data: T): void {
      transferState.set(outputsKey, data);
    },
  };
}
