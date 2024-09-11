import type { H3Event, H3EventContext } from 'h3';
import type { $Fetch } from 'nitropack';

export type PageServerLoad = {
  params: H3EventContext['params'];
  req: H3Event['node']['req'];
  res: H3Event['node']['res'];
  fetch: $Fetch;
  event: H3Event;
};

export type LoadResult<
  A extends (pageServerLoad: PageServerLoad) => Promise<any>
> = Awaited<ReturnType<A>>;

export type PageServerAction = {
  params: H3EventContext['params'];
  req: H3Event['node']['req'];
  res: H3Event['node']['res'];
  fetch: $Fetch;
  event: H3Event;
};
