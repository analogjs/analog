import { HttpParams, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { API_PREFIX, BASE_URL } from '@analogjs/router/tokens';
import { firstValueFrom, of } from 'rxjs';

import { requestContextInterceptor } from './request-context';

describe('requestContextInterceptor', () => {
  const baseUrl = 'http://localhost:3000';
  const endpoint = `${baseUrl}/api/_analog/pages/index`;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: BASE_URL, useValue: baseUrl },
        { provide: API_PREFIX, useValue: 'api' },
      ],
    });

    const raw = vi.fn().mockResolvedValue({ _data: {}, headers: {} });
    (global as any).$fetch = { raw };

    return { raw };
  }

  afterEach(() => {
    delete (global as any).$fetch;
    TestBed.resetTestingModule();
  });

  function intercept(
    req: HttpRequest<unknown>,
    next: any = () => of(new HttpResponse()),
  ) {
    return TestBed.runInInjectionContext(() =>
      requestContextInterceptor(req, next),
    );
  }

  it('should forward the query string to the internal fetch', async () => {
    const { raw } = setup();

    await firstValueFrom(
      intercept(new HttpRequest('GET', `${endpoint}?level=middle&level=top`)),
    );

    expect(raw).toHaveBeenCalledWith(
      '/api/_analog/pages/index?level=middle&level=top',
      expect.anything(),
    );
  });

  it('should forward request params to the internal fetch', async () => {
    const { raw } = setup();

    await firstValueFrom(
      intercept(
        new HttpRequest('GET', endpoint, {
          params: new HttpParams().set('level', 'middle'),
        }),
      ),
    );

    expect(raw).toHaveBeenCalledWith(
      '/api/_analog/pages/index?level=middle',
      expect.anything(),
    );
  });

  it('should restore the transferred response for the matching query only', async () => {
    setup();

    const serverResponse = (await firstValueFrom(
      intercept(new HttpRequest('GET', `${endpoint}?level=middle`)),
    )) as HttpResponse<unknown>;
    expect(serverResponse.url).toBe('/api/_analog/pages/index?level=middle');

    delete (global as any).$fetch;

    const restored = await firstValueFrom(
      intercept(new HttpRequest('GET', `${endpoint}?level=middle`)),
    );
    expect(restored).toBeInstanceOf(HttpResponse);

    const notRestored = await firstValueFrom(
      intercept(new HttpRequest('GET', `${endpoint}?level=top`), () =>
        of('from network'),
      ),
    );
    expect(notRestored).toBe('from network');
  });
});
