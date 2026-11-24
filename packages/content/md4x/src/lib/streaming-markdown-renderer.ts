/**
 * Transforms a stream of markdown chunks into a stream of rendered HTML.
 * Uses md4x's `heal()` to fix incomplete markdown from streaming sources
 * (LLMs, collaborative editing) so each emitted HTML chunk is valid.
 *
 * @experimental Streaming markdown support is experimental and may change in future releases.
 *
 * @example
 * ```typescript
 * // In a Nitro API route
 * import { streamMarkdown } from '@analogjs/content';
 *
 * export default defineEventHandler(async (event) => {
 *   const llmStream = getAIStream(prompt);
 *   return streamMarkdown(llmStream, { heal: true });
 * });
 * ```
 */
export async function streamMarkdown(
  input: ReadableStream<string>,
  options?: { heal?: boolean },
): Promise<ReadableStream<string>> {
  const { renderToHtml, heal } = await import('md4x/napi');

  let buffer = '';
  let closed = false;
  const reader = input.getReader();

  const release = async (reason?: unknown) => {
    if (closed) {
      return;
    }
    closed = true;
    return reader.cancel(reason).finally(() => reader.releaseLock());
  };

  return new ReadableStream<string>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (closed) {
          return;
        }

        if (done) {
          closed = true;
          reader.releaseLock();
          if (buffer) {
            const source = options?.heal ? heal(buffer) : buffer;
            controller.enqueue(renderToHtml(source));
          }
          controller.close();
          return;
        }

        buffer += value;
        const source = options?.heal ? heal(buffer) : buffer;
        controller.enqueue(renderToHtml(source));
      } catch (error) {
        controller.error(error);
        await release(error).catch(() => undefined);
      }
    },
    cancel(reason) {
      return release(reason);
    },
  });
}
