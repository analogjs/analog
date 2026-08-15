import type { PageServerLoad } from '@analogjs/router';

export async function load({ params }: PageServerLoad) {
  return { loaded: 'from-server-load', params: params ?? {} };
}

export async function action() {
  return { ok: true };
}
