import { readFormData } from 'h3';
import type { PageServerLoad } from '@analogjs/router';
import {
  fail,
  json,
  type PageServerAction,
} from '@analogjs/router/server/actions';

export async function load({ params }: PageServerLoad) {
  return { loaded: 'from-server-load', params: params ?? {} };
}

export async function action({ event }: PageServerAction) {
  const form = await readFormData(event);
  const comment = form.get('comment');

  if (!comment) {
    return fail(422, { comment: 'required' });
  }

  return json({ saved: String(comment) });
}
