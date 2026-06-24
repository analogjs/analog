export {
  ANALOG_DOCS_CONFIG,
  injectDocsConfig,
  provideAnalogDocs,
  type DocsBrandConfig,
  type DocsConfig,
  type DocsFooterColumn,
  type DocsFooterConfig,
  type DocsLocale,
  type DocsLocalesConfig,
  type DocsNavLink,
  type DocsSearchConfig,
} from './lib/config';

export {
  findSidebarIndex,
  flattenSidebar,
  type FlatSidebarEntry,
  type SidebarCategory,
  type SidebarDoc,
  type SidebarNode,
} from './lib/sidebar';

export { resolveActiveLocale, useLocaleSignal } from './lib/locale';
