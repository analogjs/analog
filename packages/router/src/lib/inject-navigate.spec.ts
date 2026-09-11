import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { injectNavigate } from './inject-navigate';

describe('injectNavigate', () => {
  it('should navigate using the resolved URL', async () => {
    const navigateByUrl = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { navigateByUrl } }],
    });

    const navigate = TestBed.runInInjectionContext(() => injectNavigate());

    await navigate('/users/[id]' as any, { params: { id: '42' } });
    expect(navigateByUrl).toHaveBeenCalledWith('/users/42', undefined);
  });

  it('should include query and hash in the URL', async () => {
    const navigateByUrl = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { navigateByUrl } }],
    });

    const navigate = TestBed.runInInjectionContext(() => injectNavigate());

    await navigate('/about' as any, {
      query: { ref: 'home' },
      hash: 'team',
    });
    expect(navigateByUrl).toHaveBeenCalledWith(
      '/about?ref=home#team',
      undefined,
    );
  });

  it('should pass NavigationBehaviorOptions to navigateByUrl', async () => {
    const navigateByUrl = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { navigateByUrl } }],
    });

    const navigate = TestBed.runInInjectionContext(() => injectNavigate());

    await navigate(
      '/users/[id]' as any,
      { params: { id: '42' } },
      { replaceUrl: true, skipLocationChange: true },
    );
    expect(navigateByUrl).toHaveBeenCalledWith('/users/42', {
      replaceUrl: true,
      skipLocationChange: true,
    });
  });

  it('should navigate without route options but with extras', async () => {
    const navigateByUrl = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { navigateByUrl } }],
    });

    const navigate = TestBed.runInInjectionContext(() => injectNavigate());

    await navigate('/about' as any, undefined, { replaceUrl: true });
    expect(navigateByUrl).toHaveBeenCalledWith('/about', {
      replaceUrl: true,
    });
  });

  it('should treat a single extras object as navigation extras', async () => {
    const navigateByUrl = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { navigateByUrl } }],
    });

    const navigate = TestBed.runInInjectionContext(() => injectNavigate());

    await navigate('/about' as any, { replaceUrl: true });
    expect(navigateByUrl).toHaveBeenCalledWith('/about', {
      replaceUrl: true,
    });
  });
});
