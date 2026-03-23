import { defineAction, json } from '@analogjs/router/server/actions';
import * as v from 'valibot';

const ContactSchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty('name is required')),
  email: v.pipe(v.string(), v.nonEmpty('email is required')),
});

type ContactInput = v.InferOutput<typeof ContactSchema>;

export type ContactActionSuccess = {
  received: true;
  name: string;
  email: string;
};

type SchemaIssue = {
  message: string;
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
};

export type ContactActionError = readonly SchemaIssue[];

export const action = defineAction({
  schema: ContactSchema,
  handler: async ({ data }) => {
    return json<ContactActionSuccess>({
      received: true,
      name: data.name,
      email: data.email,
    });
  },
});

export const schemalessAction = defineAction({
  handler: async ({ data }) => {
    return json({ raw: true, data });
  },
});
