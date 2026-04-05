import {
  type PageServerAction,
  fail,
  json,
} from '@analogjs/router/server/actions';

export type LegacyActionSuccess = {
  type: 'success';
  email: string;
};

export type LegacyActionError =
  | {
      email?: string;
    }
  | undefined;

export async function action({ event }: PageServerAction) {
  const body = await event.req.formData();
  const email = body.get('email');

  if (typeof email !== 'string' || email.length === 0) {
    return fail<Exclude<LegacyActionError, undefined>>(422, {
      email: 'Email is required',
    });
  }

  return json<LegacyActionSuccess>({
    type: 'success',
    email,
  });
}
