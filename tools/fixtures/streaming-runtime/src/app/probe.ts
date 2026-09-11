import { InjectionToken } from '@angular/core';

export const PROBE_ID = new InjectionToken<string>('stream fixture request');
export interface Probe {
  started: number;
  destroyed: number;
  pending: number;
  aborted: number;
  scheduled: number;
  release?: () => void;
}
declare global {
  var __analogStreamProbe: Map<string, Probe> | undefined;
}

export function probe(id: string): Probe {
  const records = (globalThis.__analogStreamProbe ??= new Map());
  let record = records.get(id);
  if (!record) {
    record = { started: 0, destroyed: 0, pending: 0, aborted: 0, scheduled: 0 };
    records.set(id, record);
  }
  return record;
}

export function delayedValue(id: string, signal: AbortSignal): Promise<string> {
  const record = probe(id);
  record.pending++;
  record.scheduled++;
  return new Promise((resolve, reject) => {
    const finish = () => {
      record.pending--;
      record.release = undefined;
      signal.removeEventListener('abort', abort);
    };
    const release = () => {
      clearTimeout(timer);
      finish();
      resolve(`slow-${id}`);
    };
    const timer = setTimeout(
      release,
      id.startsWith('disconnect') || id.startsWith('gated') ? 30000 : 350,
    );
    record.release = release;
    const abort = () => {
      clearTimeout(timer);
      finish();
      record.aborted++;
      reject(signal.reason);
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
