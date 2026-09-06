/** Owns stream closure, queued block flushes and platform cleanup across completion and cancellation. */
export interface SsrStreamWriter {
  readonly active: boolean;
  enqueue(html: string): void;
  scheduleBlock(serialize: () => string): void;
  finishBlocks(): Promise<void>;
}

export function createSsrStream(options: {
  signal?: AbortSignal;
  waitUntil?(task: Promise<void>): void;
  errorHtml?: string;
  render(writer: SsrStreamWriter): Promise<void>;
  destroy(): Promise<void>;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const pending = new Map<
    ReturnType<typeof setTimeout>,
    { promise: Promise<void>; resolve(): void }
  >();
  let state: 'rendering' | 'closing' | 'closed' | 'failed' | 'cancelled' =
    'rendering';
  let capturing = true;
  let cleanup: Promise<void> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let complete!: () => void;
  const completed = new Promise<void>((resolve) => {
    complete = resolve;
  });

  function destroy(): Promise<void> {
    capturing = false;
    clearInterval(keepAlive);
    options.signal?.removeEventListener('abort', abort);
    for (const [timer, task] of pending) {
      clearTimeout(timer);
      task.resolve();
    }
    pending.clear();
    return (cleanup ??= Promise.resolve()
      .then(options.destroy)
      .finally(complete));
  }

  function fail(error: unknown, aborted = false): void {
    if (state !== 'rendering' && state !== 'closing') return;
    state = 'failed';
    if (options.errorHtml && !aborted) {
      console.error('[analog ssr]', error);
      controller.enqueue(encoder.encode(options.errorHtml));
      controller.close();
    } else {
      controller.error(error);
    }
    // The stream already owns the original failure. Consume cleanup failures
    // here; the render finalizer and body cancellation also await cleanup.
    void destroy().catch(() => undefined);
  }

  function abort(): void {
    fail(
      options.signal?.reason ??
        new DOMException('The render was aborted.', 'AbortError'),
      true,
    );
  }

  const writer: SsrStreamWriter = {
    get active() {
      return state === 'rendering';
    },
    enqueue(html) {
      if (state === 'rendering') controller.enqueue(encoder.encode(html));
    },
    scheduleBlock(serialize) {
      if (state !== 'rendering' || !capturing) return;
      let resolve!: () => void;
      const promise = new Promise<void>((finish) => {
        resolve = finish;
      });
      const timer = setTimeout(() => {
        try {
          if (state === 'rendering') writer.enqueue(serialize());
        } catch (error) {
          fail(error);
        } finally {
          pending.delete(timer);
          resolve();
        }
      }, 0);
      pending.set(timer, { promise, resolve });
    },
    async finishBlocks() {
      capturing = false;
      await Promise.all([...pending.values()].map((task) => task.promise));
    },
  };

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      if (options.waitUntil) {
        options.waitUntil(completed);
        // Workers detect a disconnected HTTP client on a subsequent write.
        // Keep the stream observable while Angular waits for asynchronous data.
        keepAlive = setInterval(
          () => writer.enqueue('<!--analog-render-pending-->'),
          1000,
        );
      }
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      // Do not return the render promise: cancellation must be able to run
      // while bootstrap or application stability is still pending.
      void (async () => {
        try {
          if (state === 'rendering') await options.render(writer);
          if (state === 'rendering') {
            state = 'closing';
            await destroy();
            if (state === 'closing') {
              state = 'closed';
              controller.close();
            }
          }
        } catch (error) {
          fail(error);
        } finally {
          await destroy();
        }
      })().catch(fail);
    },
    cancel() {
      state = 'cancelled';
      return destroy();
    },
  });
}
