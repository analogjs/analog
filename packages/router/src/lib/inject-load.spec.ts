import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';

import { injectLoadData } from './inject-load';

async function mockLoad() {
  return {
    greeting: 'Hello, analog!',
  };
}

describe('injectLoadData', () => {
  it('returns typed page load data', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({
              load: {
                greeting: 'Hello, analog!',
              },
            }),
          },
        },
      ],
    });

    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(injectLoadData<typeof mockLoad>()),
    );

    expect(result).toEqual({ greeting: 'Hello, analog!' });
  });

  it('throws when route data contains a response', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({
              load: new Response(null, { status: 422 }),
            }),
          },
        },
      ],
    });

    await expect(
      TestBed.runInInjectionContext(() =>
        firstValueFrom(injectLoadData<typeof mockLoad>()),
      ),
    ).rejects.toThrow('Expected page load data but received a response.');
  });
});
