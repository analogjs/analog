import { describe, expect, it, vi } from 'vitest';
import type { PageServerAction } from './actions';
import { fail, json } from './actions';

type LegacyActionSuccess = {
  type: 'success';
  email: string;
};

async function legacyNewsletterAction({ event }: PageServerAction) {
  const body = await event.req.formData();
  const email = body.get('email');

  if (typeof email !== 'string' || email.length === 0) {
    return fail(422, { email: 'Email is required' });
  }

  return json<LegacyActionSuccess>({
    type: 'success',
    email,
  });
}

function createLegacyActionContext(formData: FormData): PageServerAction {
  return {
    params: {},
    req: {} as never,
    res: {} as never,
    fetch: vi.fn() as never,
    event: {
      req: {
        formData: vi.fn().mockResolvedValue(formData),
      },
    } as never,
  };
}

describe('PageServerAction compatibility pattern', () => {
  it('supports reading form data from event.req.formData()', async () => {
    const formData = new FormData();
    formData.set('email', 'legacy@example.com');

    const response = await legacyNewsletterAction(
      createLegacyActionContext(formData),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: 'success',
      email: 'legacy@example.com',
    });
  });

  it('supports returning validation errors through fail()', async () => {
    const response = await legacyNewsletterAction(
      createLegacyActionContext(new FormData()),
    );

    expect(response.status).toBe(422);
    expect(response.headers.get('X-Analog-Errors')).toBe('true');
    expect(await response.json()).toEqual({
      email: 'Email is required',
    });
  });
});
