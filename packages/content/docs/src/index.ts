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

export { useLocaleSignal } from './lib/locale';

export { DocFooter } from './lib/components/doc-footer';
export { EnhanceCode } from './lib/components/enhance-code';
export { Footer } from './lib/components/footer';
export { Header } from './lib/components/header';
export { LocalePicker } from './lib/components/locale-picker';
export {
  Search,
  currentLocaleFromPath,
  localizeHitUrl,
} from './lib/components/search';
export { Sidebar } from './lib/components/sidebar';
export { SidebarDrawer } from './lib/components/sidebar-drawer';
export { ThemeToggle } from './lib/components/theme-toggle';
export { Toc, extractHeadings, type Heading } from './lib/components/toc';
