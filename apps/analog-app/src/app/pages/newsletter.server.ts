import { PageServerAction } from '@analogjs/router';
import { readFormData } from 'h3';

import type { ActionResult } from './form-action.directive';

function fail(status: number, errors: object) {
  return new Response(JSON.stringify(errors), {
    status,
    headers: {
      'X-Analog-Errors': 'true',
    },
  });
}

function json(data: object, status = 301) {
  return new Response(JSON.stringify(data), {
    status,
  });
}

function redirect(url: string) {
  return new Response(null, {
    status: 301,
    headers: {
      'X-Analog-Redirect': url,
    },
  });
}

export function load() {
  return {
    loaded: true,
  };
}

export async function action({
  event,
}: PageServerAction): Promise<ActionResult> {
  const body = await readFormData(event);
  const email = body.get('email') as string;

  if (!email) {
    return fail(422, { errors: { email: 'Email is required' } });
  }

  if (email.length < 10) {
    return redirect('/');
  }

  console.log({ email: body.get('email') });

  return json({ type: 'success' });
}
