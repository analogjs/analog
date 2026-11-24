import { definePageLoad } from '@analogjs/router/server/actions';
import * as v from 'valibot';

const RouteParamsSchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty('name is required')),
});

const GreetQuerySchema = v.object({
  shout: v.optional(v.picklist(['true', 'false']), 'false'),
});

export const load = definePageLoad({
  params: RouteParamsSchema,
  query: GreetQuerySchema,
  handler: async ({ params, query }) => {
    const shout = query.shout === 'true';
    const greeting = shout ? params.name.toUpperCase() : params.name;

    return {
      greeting: `Hello, ${greeting}!`,
      name: params.name,
      shout,
    };
  },
});
