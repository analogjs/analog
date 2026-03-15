import { describe, expect, it } from 'vitest';

import {
  issuePathToFieldName,
  issuesToFieldErrors,
  issuesToFormErrors,
} from './validation-errors';

describe('validation-errors', () => {
  it('converts issue paths to field names', () => {
    expect(issuePathToFieldName(['user', { key: 'address' }, 'zip', 0])).toBe(
      'user.address.zip.0',
    );
  });

  it('groups field errors by normalized path', () => {
    expect(
      issuesToFieldErrors([
        { message: 'Required', path: ['email'] },
        { message: 'Invalid format', path: ['email'] },
        { message: 'Too short', path: ['profile', { key: 'name' }] },
      ]),
    ).toEqual({
      email: ['Required', 'Invalid format'],
      'profile.name': ['Too short'],
    });
  });

  it('collects form-level errors without a path', () => {
    expect(
      issuesToFormErrors([
        { message: 'Something went wrong' },
        { message: 'Email required', path: ['email'] },
        { message: 'Please try again later', path: [] },
      ]),
    ).toEqual(['Something went wrong', 'Please try again later']);
  });
});
