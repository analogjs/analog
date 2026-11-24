import { defineAction, json } from '@analogjs/router/server/actions';
import * as v from 'valibot';

const ContactSchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty('Name is required')),
  email: v.pipe(v.string(), v.email('Enter a valid email')),
});

export type ContactResult = { received: true; name: string };

/** Handles the contact form's POST, validated with valibot. */
export const action = defineAction({
  schema: ContactSchema,
  handler: async ({ data }) =>
    json<ContactResult>({ received: true, name: data.name }),
});
