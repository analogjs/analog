import { describe, expect, it } from 'vitest';
import type { ServerContext } from '@analogjs/router/tokens';
import { isLikelyBot, streamingDisabledByRoute } from './stream-request';

function ctx(
  headers: Record<string, string> = {},
  resHeaders: Record<string, string> = {},
): ServerContext {
  return {
    req: { headers },
    res: { getHeader: (name: string) => resHeaders[name] },
  } as unknown as ServerContext;
}

describe('isLikelyBot', () => {
  it('matches common crawler user-agents', () => {
    expect(isLikelyBot(ctx({ 'user-agent': 'Googlebot/2.1' }))).toBe(true);
    expect(isLikelyBot(ctx({ 'user-agent': 'facebookexternalhit/1.1' }))).toBe(
      true,
    );
    expect(isLikelyBot(ctx({ 'user-agent': 'HeadlessChrome/120' }))).toBe(true);
  });

  it('does not match a normal browser user-agent', () => {
    expect(
      isLikelyBot(
        ctx({
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }),
      ),
    ).toBe(false);
  });

  it('is false when there is no user-agent', () => {
    expect(isLikelyBot(ctx({}))).toBe(false);
  });
});

describe('streamingDisabledByRoute', () => {
  it('is true when the x-analog-no-streaming header is "true"', () => {
    expect(
      streamingDisabledByRoute(ctx({}, { 'x-analog-no-streaming': 'true' })),
    ).toBe(true);
  });

  it('is false when the header is absent', () => {
    expect(streamingDisabledByRoute(ctx({}, {}))).toBe(false);
  });
});
