import type { H3Event, H3EventContext } from 'h3';
import { $Fetch } from 'nitropack';

export type PageServerLoad = {
  params: H3EventContext['params'];
  req: H3Event['node']['req'];
  res: H3Event['node']['res'];
  fetch: $Fetch;
};

export type LoadResult<
  A extends (pageServerLoad: PageServerLoad) => Promise<any>
> = Awaited<ReturnType<A>>;
