import { firstValueFrom, isObservable, Observable } from 'rxjs';

declare const Zone: any;

export async function waitFor<T>(prom: Promise<T> | Observable<T>): Promise<T> {
  if (isObservable(prom)) {
    prom = firstValueFrom(prom);
  }

  if (typeof Zone === 'undefined') {
    return prom;
  }

  const macroTask = Zone.current.scheduleMacroTask(
    `AnalogContentResolve-${Math.random()}`,
    () => {},
    {},
    () => {},
  );
  return prom.then((p: T) => {
    macroTask.invoke();
    return p;
  });
}
