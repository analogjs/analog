import type { ServerContext } from '@analogjs/router/tokens';

/**
 * Per-request decisions about whether the streaming renderer should fall back
 * to a buffered render. Extracted from `render-stream` so they can be unit
 * tested without driving the platform.
 */

/**
 * User agents that receive a fully buffered render (with a resolved `<head>`)
 * instead of the streamed shell. Streaming flushes the head before the app has
 * set a dynamic title/meta and reconciles it via a finalize script; a crawler
 * that does not run that script would index the shell's static head. Mirrors
 * Nuxt's bot bypass — streaming targets interactive clients, bots get the
 * buffered path whose head is byte-identical to the classic `render()`.
 */
export const SSR_BOT_RE =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegrambot|lighthouse|google-inspectiontool|headlesschrome|bingpreview/i;

export function isLikelyBot(serverContext: ServerContext): boolean {
  const ua = serverContext?.req?.headers?.['user-agent'];
  return typeof ua === 'string' && SSR_BOT_RE.test(ua);
}

/**
 * Whether streaming is disabled for this request by a `streaming: false` route
 * rule. The platform plugin translates that rule into an `x-analog-no-streaming`
 * response header (mirroring how `ssr: false` becomes `x-analog-no-ssr`); when
 * present, `renderStream` produces the buffered `render()` output for this
 * route instead of streaming.
 */
export function streamingDisabledByRoute(
  serverContext: ServerContext,
): boolean {
  return serverContext?.res?.getHeader?.('x-analog-no-streaming') === 'true';
}
