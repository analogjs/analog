import type { IncomingMessage, ServerResponse } from 'node:http';
import type { H3Event } from 'nitro/h3';

type NodeContext = NonNullable<H3Event['node']>;
type NodeRuntimeContext = NodeContext & {
  req: IncomingMessage;
  res: ServerResponse;
};

/**
 * Dispatch provides the Node request and response through `REQUEST` and
 * `RESPONSE`, which are typed as Node primitives, so server functions only run
 * on a Node runtime. h3 leaves `node` undefined on other runtimes.
 */
export function assertNodeContext(
  event: Pick<H3Event, 'node'>,
): NodeRuntimeContext {
  const node = event.node;

  if (!node?.req || !node.res) {
    throw new Error(
      '@analogjs/router: server functions require a Node runtime.',
    );
  }

  return node as NodeRuntimeContext;
}
