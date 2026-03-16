import type { H3Event, H3EventContext } from 'nitro/h3';
import type { $Fetch } from 'nitro/types';

// Preserve the existing Node req/res public contract while accommodating h3
// v2's nullable `event.node` typing.
export type NodeContext = NonNullable<H3Event['node']>;

export type PageServerLoad = {
  params: H3EventContext['params'];
  req: NodeContext['req'];
  res: NonNullable<NodeContext['res']>;
  fetch: $Fetch;
  event: H3Event;
};

export type LoadResult<
  A extends (pageServerLoad: PageServerLoad) => Promise<any>,
> = Awaited<ReturnType<A>>;
