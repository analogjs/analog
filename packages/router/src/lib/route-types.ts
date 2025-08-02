import type { H3Event, H3EventContext } from 'h3';
import type { $Fetch } from 'nitro/types';

export type PageServerLoad = {
  params: H3EventContext['params'];
  req: H3Event['req'];
  res?: H3Event['_res'];
  fetch: $Fetch;
  event: H3Event;
};

export type LoadResult<
  A extends (pageServerLoad: PageServerLoad) => Promise<any>,
> = Awaited<ReturnType<A>>;
