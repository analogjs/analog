---
title: ''
---

import VitePlugin, { toc as VitePluginToc } from '../../../../../packages/vite-plugin-nitro/README.md';

<VitePlugin />

<!-- Workaround for generating table of contents -->
<!-- See https://github.com/facebook/docusaurus/issues/3915#issuecomment-896193142 -->

export const toc = [...VitePluginToc];
