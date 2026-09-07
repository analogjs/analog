import { Observable, takeUntil } from 'rxjs';

export function withAbortSignal<T>(
  source: Observable<T>,
  signal?: AbortSignal,
): Observable<T> {
  if (!signal) return source;
  const aborted = new Observable<never>((subscriber) => {
    const abort = () =>
      subscriber.error(
        signal.reason ?? new DOMException('Request aborted', 'AbortError'),
      );
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    return () => signal.removeEventListener('abort', abort);
  });
  // Subscribe to cancellation first, including already-aborted signals and
  // interceptors that synchronously settle or abort while being subscribed.
  return source.pipe(takeUntil(aborted));
}
