import { ServerRequest } from '@analogjs/router/tokens';
import { defineEventHandler, sendRedirect } from 'h3';

import { createClient } from '../supabase';

export default defineEventHandler(async (event) => {
  const client = createClient({ req: event.node.req as ServerRequest, res: event.node.res });

  if (event.node.req.originalUrl?.includes('protected')) {
    const { data, error } = await client.auth.getUser();

    if (error || !data) {
      return sendRedirect(event, '/login');
    }
  }
});