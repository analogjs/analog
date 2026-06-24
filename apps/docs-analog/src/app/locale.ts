/**
 * Locales served under a `/<code>/` prefix. English is the unprefixed
 * default and is intentionally NOT listed here. Used by the route
 * matcher in app.config.ts (which runs pre-bootstrap, before any
 * provider is available to inject).
 */
export const SUPPORTED_LOCALES = ['de', 'es', 'pt-br', 'zh-hans'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
