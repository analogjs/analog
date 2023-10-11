## [0.2.12](https://github.com/analogjs/analog/compare/0.2.11...0.2.12) (2023-10-10)

### Bug Fixes

- **astro-angular:** warn about shiki in mdx astro integration and override with prism ([#691](https://github.com/analogjs/analog/issues/691)) ([10ed7e5](https://github.com/analogjs/analog/commit/10ed7e5e45a3f30fdba16e546cabfee78356a9fc))
- **create-analog:** pin Nx packages to 16.8.1 ([#689](https://github.com/analogjs/analog/issues/689)) ([2a33363](https://github.com/analogjs/analog/commit/2a333630edfb6c702515b49799a5f04d08cd594b))

## [0.2.11](https://github.com/analogjs/analog/compare/0.2.10...0.2.11) (2023-10-02)

### Features

- **vite-plugin-angular:** add snapshot testing support for vitest ([#678](https://github.com/analogjs/analog/issues/678)) ([54166d7](https://github.com/analogjs/analog/commit/54166d7deec9df43245d9906a5430adcbd13fcb5))

## [0.2.10](https://github.com/analogjs/analog/compare/0.2.9...0.2.10) (2023-09-27)

### Bug Fixes

- **create-analog:** fix templates included with create-analog ([299d907](https://github.com/analogjs/analog/commit/299d907d566cdde357eefa8c44f596ac4fd64b66))
- **vite-plugin-nitro:** update import detection for zone.js in node ([#674](https://github.com/analogjs/analog/issues/674)) ([4ae6dd8](https://github.com/analogjs/analog/commit/4ae6dd8354997ff1bda036242dc4fce695a68470))

## [0.2.9](https://github.com/analogjs/analog/compare/0.2.8...0.2.9) (2023-09-25)

## [0.2.8](https://github.com/analogjs/analog/compare/0.2.7...0.2.8) (2023-09-25)

### Features

- **content:** `ContentRenderer` is able to return a TOC ([#659](https://github.com/analogjs/analog/issues/659)) ([55ee2e1](https://github.com/analogjs/analog/commit/55ee2e1e25c8ec1fa852f262a1281b8b01977c3e))

## [0.2.7](https://github.com/analogjs/analog/compare/0.2.6...0.2.7) (2023-09-21)

### Bug Fixes

- **vite-plugin-nitro:** enable prerendering of root index.html ([#663](https://github.com/analogjs/analog/issues/663)) ([c231f56](https://github.com/analogjs/analog/commit/c231f5696958c282f11b18c063bfe7d0d295da91))

## [0.2.6](https://github.com/analogjs/analog/compare/0.2.5...0.2.6) (2023-09-21)

## [0.2.5](https://github.com/analogjs/analog/compare/0.2.4...0.2.5) (2023-09-19)

### Bug Fixes

- **platform:** remove global define, update platform-server replacements ([#661](https://github.com/analogjs/analog/issues/661)) ([e9a14df](https://github.com/analogjs/analog/commit/e9a14dfeb3bc26419cc20924024638484e616631))

## [0.2.4](https://github.com/analogjs/analog/compare/0.2.3...0.2.4) (2023-09-19)

### Bug Fixes

- **astro-angular,vite-plugin-angular:** update zone.js deep imports for compatibility ([#651](https://github.com/analogjs/analog/issues/651)) ([704e2e9](https://github.com/analogjs/analog/commit/704e2e9217ebbfc8d922331be2f22dc38450982c))

### Features

- add support for non-node/Cloudflare builds ([#638](https://github.com/analogjs/analog/issues/638)) ([0ee7965](https://github.com/analogjs/analog/commit/0ee7965ee7409879b2031a57af7553af738db32c))

## [0.2.3](https://github.com/analogjs/analog/compare/0.2.2...0.2.3) (2023-09-14)

### Bug Fixes

- **trpc:** avoid hard coding of host/port by using $fetch/fetch when … ([#639](https://github.com/analogjs/analog/issues/639)) ([a30ac8a](https://github.com/analogjs/analog/commit/a30ac8a9cd44b11e538ddc3502c54c35563c462c))

### Features

- **astro-angular:** implement output forwarding on client-side hydrated components ([#641](https://github.com/analogjs/analog/issues/641)) ([3e836cb](https://github.com/analogjs/analog/commit/3e836cb429692f8cb59db4d7a3cac4e8b14c91d2))

## [0.2.2](https://github.com/analogjs/analog/compare/0.2.1...0.2.2) (2023-09-04)

### Features

- **content:** support prismjs diff highlight ([#624](https://github.com/analogjs/analog/issues/624)) ([f2c8805](https://github.com/analogjs/analog/commit/f2c8805075ccad221cc1f18dbbdd9cd98b4e053c))

## [0.2.1](https://github.com/analogjs/analog/compare/0.2.0...0.2.1) (2023-08-28)

### Bug Fixes

- **nx-plugin:** normalize outputs for standalone Nx projects ([#617](https://github.com/analogjs/analog/issues/617)) ([1c045fd](https://github.com/analogjs/analog/commit/1c045fd7f60ff52e6dfdb5a8014d89c6ccec01af))
- **vite-plugin-nitro:** add config root fallback paths and update renderer paths ([#618](https://github.com/analogjs/analog/issues/618)) ([d07a566](https://github.com/analogjs/analog/commit/d07a5662ec1969642d29f0e05e11d8edd0b91291))

### Features

- **vite-plugin-nitro:** add server event to load function and types ([#614](https://github.com/analogjs/analog/issues/614)) ([b69987a](https://github.com/analogjs/analog/commit/b69987a5b4f3cd9cadba3dfbf267a2f2fff8752d))

# [0.2.0](https://github.com/analogjs/analog/compare/0.2.0-beta.0...0.2.0) (2023-08-21)

### Bug Fixes

- add common Angular libraries for ssr transform ([#475](https://github.com/analogjs/analog/issues/475)) ([4ef3872](https://github.com/analogjs/analog/commit/4ef38721cba67fed4911dae43e389f6282d9fea2))
- add mermaid dependency to new projects ([#570](https://github.com/analogjs/analog/issues/570)) ([525c6c9](https://github.com/analogjs/analog/commit/525c6c913679b0d5290d71279c63748ed433a793))
- add transform filter to vite plugin ([#516](https://github.com/analogjs/analog/issues/516)) ([9b0b211](https://github.com/analogjs/analog/commit/9b0b2114ffcaa1e235197d07d8af711f6681f55d))
- **astro-angular:** fix sourcemaps for build ([#462](https://github.com/analogjs/analog/issues/462)) ([b9c7873](https://github.com/analogjs/analog/commit/b9c7873dc1881d04ae8256a3bb8f2d8b2faa5166))
- **content:** add async flag to marked highlight config ([#509](https://github.com/analogjs/analog/issues/509)) ([dc50600](https://github.com/analogjs/analog/commit/dc506001d96488b7aac6966c1e3b066e86ddeab4))
- **content:** do not run change detection when loading mermaid ([#562](https://github.com/analogjs/analog/issues/562)) ([0436b6f](https://github.com/analogjs/analog/commit/0436b6fe7d64d11be7bbf0dd94b6a988118c2087))
- **content:** ensure prism toolbar is loaded first, use external mermaid loader ([#564](https://github.com/analogjs/analog/issues/564)) ([9ab2884](https://github.com/analogjs/analog/commit/9ab28846c7b1756d0e3fd94d82b50ea5ab35e6b4))
- **content:** fix deprecation warnings for marked package ([#487](https://github.com/analogjs/analog/issues/487)) ([87a978b](https://github.com/analogjs/analog/commit/87a978bb06525ac4cc47efb47fed6232aeb73cf0))
- **content:** make mermaid tree shakable ([#563](https://github.com/analogjs/analog/issues/563)) ([b7cef8a](https://github.com/analogjs/analog/commit/b7cef8a1562f60121a9c6626711226071dbf47b3))
- **content:** render markdown content in resolver for markdown route ([#415](https://github.com/analogjs/analog/issues/415)) ([096b45e](https://github.com/analogjs/analog/commit/096b45e5a65269fd6a378c1ee69d7610c560b521))
- **create-analog:** add @analogjs/content dependencies to v15 template ([3c7a46f](https://github.com/analogjs/analog/commit/3c7a46f6b1f9236aacebcca3517100dd808b642f))
- **create-analog:** add skipLibCheck to template generator ([6e11a2a](https://github.com/analogjs/analog/commit/6e11a2a0d6287171f3e7a627b27fda8f65f8222a))
- **create-analog:** pin Angular v15 template to Nx v15 ([e543dba](https://github.com/analogjs/analog/commit/e543dba4bb513f569f00ef519aa9e83d139f96a5))
- **create-analog:** pin vie-plugin-angular version in Angular v15 template ([d750116](https://github.com/analogjs/analog/commit/d750116acce5dfeb7db84d9c9c578764596e4825))
- **create-analog:** restrain node 16 to `16.17`. ([#533](https://github.com/analogjs/analog/issues/533)) ([cd099ad](https://github.com/analogjs/analog/commit/cd099ad059bc0fcdbcee498bd4da3a4f438075e5))
- **create-analog:** update Vitest for Nx 16.x ([7b39c21](https://github.com/analogjs/analog/commit/7b39c21a2a36e96f2c73821cf066d8bf51983142))
- **nx-plugin:** add counter code to welcome component, update templates ([#466](https://github.com/analogjs/analog/issues/466)) ([5a27202](https://github.com/analogjs/analog/commit/5a27202c9f942c9b2aa0007b1ef4edb773e7b4c6))
- **nx-plugin:** add linter dependency for nx app generator, preset ([#568](https://github.com/analogjs/analog/issues/568)) ([f3b8028](https://github.com/analogjs/analog/commit/f3b8028e186f3269a69d7cbf9dae84976fd0b926))
- **nx-plugin:** add missing properties to preset generator schema.json ([#387](https://github.com/analogjs/analog/issues/387)) ([72bee17](https://github.com/analogjs/analog/commit/72bee17c28c502477903ed14300c5d26907f8369))
- **nx-plugin:** cleanup styles, minor naming inconsistency, add missing await ([#549](https://github.com/analogjs/analog/issues/549)) ([a58cdd6](https://github.com/analogjs/analog/commit/a58cdd6eaa5df50648351251fa520d95646c6ada))
- **nx-plugin:** fixing linting in nx project ([#539](https://github.com/analogjs/analog/issues/539)) ([dfda110](https://github.com/analogjs/analog/commit/dfda1104047936e3fffd576ca8b41c9b12dc8cc3))
- **nx-plugin:** hide preset generator from nx console ([#542](https://github.com/analogjs/analog/issues/542)) ([77f52d5](https://github.com/analogjs/analog/commit/77f52d5c77dbadc1b78b662cf62243685cf051cf))
- **nx-plugin:** make nx plugin templates compatible with rxjs trpc client ([#430](https://github.com/analogjs/analog/issues/430)) ([5748077](https://github.com/analogjs/analog/commit/5748077206b06b068be9ebdfe0de29b22f346169))
- **nx-plugin:** remove @nx/angular import from preset ([0d60a89](https://github.com/analogjs/analog/commit/0d60a89e957b37561016122b72877a5f78037d9e))
- **nx-plugin:** remove dependency of nx-plugin to linter ([#572](https://github.com/analogjs/analog/issues/572)) ([43f30e8](https://github.com/analogjs/analog/commit/43f30e8b911b9a5e27c43dd489578ef05e47e512))
- only assign ngDevMode during build ([#373](https://github.com/analogjs/analog/issues/373)) ([b89a47a](https://github.com/analogjs/analog/commit/b89a47a1a10d1c3814afb36c266877b6bfcba197))
- **platform:** cache content attributes if they have not changed ([#561](https://github.com/analogjs/analog/issues/561)) ([e4387f2](https://github.com/analogjs/analog/commit/e4387f24d8069dc1464e2fca0d349d9738d79ee3))
- **platform:** display error overlay in SSR mode ([#375](https://github.com/analogjs/analog/issues/375)) ([3af5ab3](https://github.com/analogjs/analog/commit/3af5ab35af994e354a3053f50ef63a01eb5c9e09))
- **platform:** include Angular libs for optimization, only clear page endpoints on build ([df9dc60](https://github.com/analogjs/analog/commit/df9dc600bc864926005ff3ce11298181f6a660c3))
- **platform:** make route invalidation checks more flexible ([#338](https://github.com/analogjs/analog/issues/338)) ([e7bc83f](https://github.com/analogjs/analog/commit/e7bc83ff08d2a28fe959d66f47d4cd605e0ce238))
- **platform:** update versions for Nx generators ([#339](https://github.com/analogjs/analog/issues/339)) ([534cc76](https://github.com/analogjs/analog/commit/534cc76c3900c5e808e11fc1ca39f41a517c963c))
- **router:** add support for server-side data fetching with catch-all routes ([#602](https://github.com/analogjs/analog/issues/602)) ([dd8922f](https://github.com/analogjs/analog/commit/dd8922f73ff91f96e12e470eaa78852b6cd0d16b))
- **router:** allow dynamic routes in the root route array ([#381](https://github.com/analogjs/analog/issues/381)) ([c5ef38e](https://github.com/analogjs/analog/commit/c5ef38e099ad81add2eac6aa0743a17338640bc0))
- **router:** do not run unnecessary change detections cycles when markdown modules are loaded ([#557](https://github.com/analogjs/analog/issues/557)) ([7646549](https://github.com/analogjs/analog/commit/764654900d248ac12e54a5907cb317626944cb7e))
- **router:** remove assertInInjectionContext check for v15 compatibility ([#461](https://github.com/analogjs/analog/issues/461)) ([27a52e1](https://github.com/analogjs/analog/commit/27a52e1e9f8efd37cddbc968fc2143fad5f52d13))
- **trpc:** allow to pass custom headers to trpc client ([#441](https://github.com/analogjs/analog/issues/441)) ([a2b7eae](https://github.com/analogjs/analog/commit/a2b7eae250dd9a3947a54c2c59d4efe810d453a1))
- **trpc:** cache-state turns to inactive once app is stable ([#522](https://github.com/analogjs/analog/issues/522)) ([ac2226a](https://github.com/analogjs/analog/commit/ac2226a189681b450b5ea31131d92d8a9abf3d58))
- **trpc:** remove hard coded superjson transformer in favor of trpc client options & add e2e tests ([#378](https://github.com/analogjs/analog/issues/378)) ([6ee5a75](https://github.com/analogjs/analog/commit/6ee5a7545c4b7ed18772a9be0a6afeb435bc054e))
- **vite-plugin-angular:** add compatibility support for Angular v16.2+ ([#600](https://github.com/analogjs/analog/issues/600)) ([b82e9fe](https://github.com/analogjs/analog/commit/b82e9fe9b190368f99da224bc9fe3d2e5ae8ebde))
- **vite-plugin-angular:** add fallback for config root ([02463ad](https://github.com/analogjs/analog/commit/02463ad2c665e01297aee49732d1777512c37de1))
- **vite-plugin-angular:** add import fixes and support for Angular v16.1 ([#458](https://github.com/analogjs/analog/issues/458)) ([613fd5f](https://github.com/analogjs/analog/commit/613fd5facf94ed6b6bc2f660a86882dc6811749c))
- **vite-plugin-angular:** apply babel transformations for safari 15 s… ([#427](https://github.com/analogjs/analog/issues/427)) ([8ddb9ad](https://github.com/analogjs/analog/commit/8ddb9ad0976a21340ae81786064b0a016201cd84))
- **vite-plugin-angular:** cache already resolved style and template URLs ([#566](https://github.com/analogjs/analog/issues/566)) ([b5b6d69](https://github.com/analogjs/analog/commit/b5b6d69ca76ace1f1e6454ef9deb0ddb0ed43c78))
- **vite-plugin-angular:** cache style URLs by matched `styleUrls` expression ([#571](https://github.com/analogjs/analog/issues/571)) ([ce348f6](https://github.com/analogjs/analog/commit/ce348f61450d971f8d192931990b5ec6bf88de77))
- **vite-plugin-angular:** check whether external template/stylesheet is already watched ([#569](https://github.com/analogjs/analog/issues/569)) ([3313a7b](https://github.com/analogjs/analog/commit/3313a7baa0ad055ddaa11719bd7247a5260235c3))
- **vite-plugin-angular:** correctly inline external styles/templates in JIT mode ([#389](https://github.com/analogjs/analog/issues/389)) ([ce5ddcc](https://github.com/analogjs/analog/commit/ce5ddcc666793e1b010723360268f8326217a33a))
- **vite-plugin-angular:** do not execute hot module update if host is not set ([#558](https://github.com/analogjs/analog/issues/558)) ([2daa5b9](https://github.com/analogjs/analog/commit/2daa5b9798ef5a0b933fe9916bc275d68fde585e))
- **vite-plugin-angular:** remove caching of watched component templates ([#587](https://github.com/analogjs/analog/issues/587)) ([fcc7aa4](https://github.com/analogjs/analog/commit/fcc7aa4479b3caae6c06bbc29d18f5ba34271969))
- **vite-plugin-angular:** use raw loader to handle external templates in jit mode ([#607](https://github.com/analogjs/analog/issues/607)) ([9288570](https://github.com/analogjs/analog/commit/928857097d130524e3afbf2b1048ca4403e6692a))
- **vite-plugin-nitro:** add check for exported load function for page endpoints ([#596](https://github.com/analogjs/analog/issues/596)) ([d903fd4](https://github.com/analogjs/analog/commit/d903fd4a82b1f2932de6b91b448da4fddabc9c0f))
- **vite-plugin-nitro:** normalize page handler path for Windows ([#591](https://github.com/analogjs/analog/issues/591)) ([#603](https://github.com/analogjs/analog/issues/603)) ([a265229](https://github.com/analogjs/analog/commit/a26522966b6227d32b5c42d4b9b650bca9d48c84))
- **vite-plugin-nitro:** pass public output path to sitemap builder ([#601](https://github.com/analogjs/analog/issues/601)) ([94e7568](https://github.com/analogjs/analog/commit/94e75682436f687dfcb70d6d878e1b664eb63656))
- **vite-plugin-nitro:** use built-in $fetch for GET API requests ([b127964](https://github.com/analogjs/analog/commit/b127964444ecaedd7e9fc522366e6f023a80cdbb))
- **vite-plugin-nitro:** use proxy to relay requests without api prefix ([#404](https://github.com/analogjs/analog/issues/404)) ([0d74281](https://github.com/analogjs/analog/commit/0d742813e7749ccb164ca9886e31094a76cb134c))

### Features

- add default prerender route ([#365](https://github.com/analogjs/analog/issues/365)) ([3ded798](https://github.com/analogjs/analog/commit/3ded798886f7f6a4f388977a9ca25c7a8939474d))
- add filterFn argument to the injectContentFiles function ([#348](https://github.com/analogjs/analog/issues/348)) ([018b70d](https://github.com/analogjs/analog/commit/018b70dd485eb10e64780b8295e2ea2449072eec)), closes [#347](https://github.com/analogjs/analog/issues/347)
- add initial support to pages for server-side data fetching ([#446](https://github.com/analogjs/analog/issues/446)) ([9d1b0f8](https://github.com/analogjs/analog/commit/9d1b0f8cd596bf871be7494242f136d6e72bc4db))
- add ng update support ([#380](https://github.com/analogjs/analog/issues/380)) ([98ed521](https://github.com/analogjs/analog/commit/98ed5214406779dbff25a44af89c70c8646547ae))
- add trpc client and trpc-app as example ([#371](https://github.com/analogjs/analog/issues/371)) ([9b3382c](https://github.com/analogjs/analog/commit/9b3382cbc8d9ffa7c3e8dbd181314fa6ec0e44df))
- **astro-angular:** add support for render and client component providers ([#376](https://github.com/analogjs/analog/issues/376)) ([bbfcb40](https://github.com/analogjs/analog/commit/bbfcb40ef10bd8901823f120c94e4881fcc46c69))
- **content:** add customFilename param to injectContent ([#597](https://github.com/analogjs/analog/issues/597)) ([4f3dd68](https://github.com/analogjs/analog/commit/4f3dd68b9854d496d3044cc834561754d4adc631))
- **content:** add support for mermaid in markdown ([#555](https://github.com/analogjs/analog/issues/555)) ([28f2c20](https://github.com/analogjs/analog/commit/28f2c209da3f4cdd7f9db9b173417e1e82561a2e))
- **content:** add support for using slug from markdown frontmatter ([#496](https://github.com/analogjs/analog/issues/496)) ([a1de310](https://github.com/analogjs/analog/commit/a1de310776cee0fb2923d9e245b0bcbf374cbf68))
- handle default build/output/test config paths internally ([#425](https://github.com/analogjs/analog/issues/425)) ([1aeaaed](https://github.com/analogjs/analog/commit/1aeaaed25393c527e635c8661879788f43f881ea))
- make nx plugin work without angular preset and add tailwind option ([#370](https://github.com/analogjs/analog/issues/370)) ([c8ee37c](https://github.com/analogjs/analog/commit/c8ee37c05c1d277b05906fbebdeac5ddfeba0840))
- move nitro integration into separate vite plugin package ([#341](https://github.com/analogjs/analog/issues/341)) ([aeea815](https://github.com/analogjs/analog/commit/aeea815c510776a98c38527d5eb19fa95f9b9564)), closes [#318](https://github.com/analogjs/analog/issues/318)
- **nx-plugin:** fix angular 15.x and 16.x install support ([#481](https://github.com/analogjs/analog/issues/481)) ([acbdf14](https://github.com/analogjs/analog/commit/acbdf142cd69b1ce20e229f422c38660a3780b25))
- **nx-plugin:** initial commit page generator/schematic ([#577](https://github.com/analogjs/analog/issues/577)) ([4a2de22](https://github.com/analogjs/analog/commit/4a2de226550ab8e49ab0357eb4d40d2a66781ab9))
- **platform:** improve nx plugin and add tRPC support ([#382](https://github.com/analogjs/analog/issues/382)) ([5a25787](https://github.com/analogjs/analog/commit/5a25787c6d7fc2480e171cde3c193f565ccafbb4))
- **router:** overhaul route discovery engine ([#444](https://github.com/analogjs/analog/issues/444)) ([d99869c](https://github.com/analogjs/analog/commit/d99869c77c5b043351aa9a2c68de1b81849bf556)), closes [#237](https://github.com/analogjs/analog/issues/237) [#273](https://github.com/analogjs/analog/issues/273)
- **trpc:** add rxjs observable compatible trpc client ([#385](https://github.com/analogjs/analog/issues/385)) ([1ba886a](https://github.com/analogjs/analog/commit/1ba886ab04d0faddfb7899195b9f365599ed0d58)), closes [#379](https://github.com/analogjs/analog/issues/379)
- **trpc:** make CreateTRPCProxyClient publicly available ([#453](https://github.com/analogjs/analog/issues/453)) ([8a432a9](https://github.com/analogjs/analog/commit/8a432a9dd1c5cdd5496a9f9d7543b496fd0daec5))
- **trpc:** use consistent naming for Trpc exports and use in Nx plugin ([#454](https://github.com/analogjs/analog/issues/454)) ([6ea71fb](https://github.com/analogjs/analog/commit/6ea71fb64549c63f025eae79ad9f4bcb86bfb800))
- update template app dependencies to Angular v16.1.x, Nx 16.4.x ([#479](https://github.com/analogjs/analog/issues/479)) ([12e501c](https://github.com/analogjs/analog/commit/12e501c6160a5aa3d98ee7c83d88634c36525a3c))
- **vite-plugin-angular:** add support for JIT mode for testing ([#374](https://github.com/analogjs/analog/issues/374)) ([07af493](https://github.com/analogjs/analog/commit/07af4930563d9cf8f37a43bd87e01fee96867508))
- **vite-plugin-nitro:** add BUILD_PRESET as a deployment preset alias ([#402](https://github.com/analogjs/analog/issues/402)) ([ab800bc](https://github.com/analogjs/analog/commit/ab800bc7fe7df554c4cf74c737847b07474ad15f))
- **vite-plugin-nitro:** add initial support for sitemap generation ([#497](https://github.com/analogjs/analog/issues/497)) ([8485648](https://github.com/analogjs/analog/commit/84856483e5925904a4e2408bcffa0cd01e353c2f))
- **vite-plugin-nitro:** add support for running hooks during pre-rendering ([#548](https://github.com/analogjs/analog/issues/548)) ([46af10e](https://github.com/analogjs/analog/commit/46af10e5cbb6fd555c3917681fbc1b7daadc685f))
- **vite-plugin-nitro:** add support for XML content in API routes ([#518](https://github.com/analogjs/analog/issues/518)) ([56766d9](https://github.com/analogjs/analog/commit/56766d9bd1a0942f335b89e1beff1f49d8378d59))
- **vite-plugin-nitro:** adjust output paths for vercel preset ([#525](https://github.com/analogjs/analog/issues/525)) ([1ec80f0](https://github.com/analogjs/analog/commit/1ec80f038aff20204384cee44d95bb166c163adb))
- **vite-plugin-nitro:** upgrade Nitro dependency to 2.x ([#431](https://github.com/analogjs/analog/issues/431)) ([6c3f387](https://github.com/analogjs/analog/commit/6c3f3871d125c56628994c4c0a0568411fc052cb))

### Reverts

- Revert "build: add implicit dependency on nx-plugin to platform package (#443)" ([c02e797](https://github.com/analogjs/analog/commit/c02e797fbe8f0ebcdc8f375d2aadea9159023eb0)), closes [#443](https://github.com/analogjs/analog/issues/443)

# [0.2.0-beta.0](https://github.com/analogjs/analog/compare/6c9a98c27c07ca24098255ff833496976d8558a7...0.2.0-beta.0) (2023-04-13)

### Bug Fixes

- add configurations to analog-app ([23a4b6f](https://github.com/analogjs/analog/commit/23a4b6f1043e66fc278e084ec4713ac2b97f2306))
- add vite plugin as dependency on platform package ([bb21e9a](https://github.com/analogjs/analog/commit/bb21e9a9174ef9d3b6853bb831d6310cf8fe5356))
- add working StackBlitz link ([#323](https://github.com/analogjs/analog/issues/323)) ([2d77c7d](https://github.com/analogjs/analog/commit/2d77c7de737eb4b665379db1d3366118019c73e1))
- **angular-vite-plugin:** account for direct links to external styles/templates ([77e6559](https://github.com/analogjs/analog/commit/77e6559d0cafd6419fd8a8a3270ce9050bf7cc87))
- apply content plugin to serve ([02dab18](https://github.com/analogjs/analog/commit/02dab18cf086fd9a6992c2dbc76767edcb1336c4))
- **astro-angular:** check the component inputs before setting ([#81](https://github.com/analogjs/analog/issues/81)) ([c440629](https://github.com/analogjs/analog/commit/c4406294966480105af23ee08d2100e4cac4fd0f)), closes [#79](https://github.com/analogjs/analog/issues/79)
- **astro-angular:** inline sourcemaps into compiled output ([#99](https://github.com/analogjs/analog/issues/99)) ([0c73e1a](https://github.com/analogjs/analog/commit/0c73e1a8e5546e9323b4580897f716e50bd98228)), closes [#96](https://github.com/analogjs/analog/issues/96)
- **astro-angular:** update zone.js import to zone.js/node ([#189](https://github.com/analogjs/analog/issues/189)) ([84e9139](https://github.com/analogjs/analog/commit/84e91394b9d11005000335d59a23774302ce5959))
- **create-analog:** add @nrwl/angular package to support Nx 15.4.x ([#204](https://github.com/analogjs/analog/issues/204)) ([33d729f](https://github.com/analogjs/analog/commit/33d729fb5c3865996dda128012711f7ecdbe8e46))
- **create-analog:** add tsconfig references so IDE can recognise projects ([#65](https://github.com/analogjs/analog/issues/65)) ([08c7467](https://github.com/analogjs/analog/commit/08c7467402f6ecec13ec9f38a3f82b961e672a02))
- **create-analog:** exclude router for StackBlitz ([870d982](https://github.com/analogjs/analog/commit/870d982eac81d67aa714075086ed4c1a0f69df3f))
- **create-analog:** fail silent when commit cannot be created ([#63](https://github.com/analogjs/analog/issues/63)) ([4a66a0c](https://github.com/analogjs/analog/commit/4a66a0ca6b0ced998fbe0913cfb6ad1d6a7374c4))
- **create-analog:** fix initial commit and gitignore file in template app ([#84](https://github.com/analogjs/analog/issues/84)) ([c431cd8](https://github.com/analogjs/analog/commit/c431cd84751ae47c53b7cd81c05fd4c1309070b0))
- **create-analog:** move index.html to root in template app ([e595ed2](https://github.com/analogjs/analog/commit/e595ed2077f49210c934f09d17184abaeeb76310))
- **create-analog:** pin @nrwl/vite package to 15.3.x ([#187](https://github.com/analogjs/analog/issues/187)) ([443038c](https://github.com/analogjs/analog/commit/443038c080243142bd117a8067cb2ac61cf92eb7))
- **create-analog:** register router and initial client/server routes ([#152](https://github.com/analogjs/analog/issues/152)) ([11288d0](https://github.com/analogjs/analog/commit/11288d0de70df00bbbae4c3aaf5ae38b0a2e23f9))
- **create-analog:** set composite to false and include ts files in tsconfig ([#76](https://github.com/analogjs/analog/issues/76)) ([c287041](https://github.com/analogjs/analog/commit/c287041a476cd3cfd057cf8138782027449ecc6f)), closes [#75](https://github.com/analogjs/analog/issues/75)
- invalid cached routes on when routes are added/deleted ([1beda39](https://github.com/analogjs/analog/commit/1beda397f6a0408daaea25a29d61a26074634ce2)), closes [#119](https://github.com/analogjs/analog/issues/119)
- only use Nitro during serve, build ([#156](https://github.com/analogjs/analog/issues/156)) ([4b5b30a](https://github.com/analogjs/analog/commit/4b5b30a6351caad39a449a62dc0f3e0aa3dc44cd)), closes [#151](https://github.com/analogjs/analog/issues/151)
- **platform:** absolute paths must be valid file URLs on windows [#270](https://github.com/analogjs/analog/issues/270) ([#275](https://github.com/analogjs/analog/issues/275)) ([d9721f4](https://github.com/analogjs/analog/commit/d9721f4a99e8a030575b60e7b1dd29b632909df8))
- **platform:** add handling of routes array for prerendering ([#227](https://github.com/analogjs/analog/issues/227)) ([4f2afef](https://github.com/analogjs/analog/commit/4f2afef4305dc9cab4743d7cf5808c58e877888c))
- **platform:** apply Nitro options after defaults ([#179](https://github.com/analogjs/analog/issues/179)) ([015844c](https://github.com/analogjs/analog/commit/015844c0b3f20e9364b301d0dd02ee72d21dbae1))
- **platform:** convert runtime files to JS for pre-rendering ([#183](https://github.com/analogjs/analog/issues/183)) ([07e5b34](https://github.com/analogjs/analog/commit/07e5b34c1563243eb64e15bdbddc32ad15583c4d))
- **platform:** exclude @analogjs/content from being eagerly bundled ([c8202ab](https://github.com/analogjs/analog/commit/c8202aba23f6ef7a64a1265ce7c8cff8dc90a837))
- **platform:** exclude @analogjs/content from being eagerly bundled ([0a3c1c3](https://github.com/analogjs/analog/commit/0a3c1c3c023716bea90e284a355cd3f453dbd72c))
- **platform:** keep router package from being eagerly optimized ([b3d643b](https://github.com/analogjs/analog/commit/b3d643bfc0eb817694914ad05d8994ea63be77a5))
- **platform:** only apply nitro SSR options during build ([#191](https://github.com/analogjs/analog/issues/191)) ([151717c](https://github.com/analogjs/analog/commit/151717cefec8c65fc07b2cbec28cfa4340924e82))
- **platform:** only transform xhr2 to default import one time ([#297](https://github.com/analogjs/analog/issues/297)) ([4a1f2b3](https://github.com/analogjs/analog/commit/4a1f2b32846ebb5780279cfe13f0a3e5a36bd0b0))
- **platform:** optimize content package if installed ([ebc3815](https://github.com/analogjs/analog/commit/ebc38158efe5d4e7bc949eebb6fc8dc7012231a9))
- **platform:** update directory for public assets ([dfed7f0](https://github.com/analogjs/analog/commit/dfed7f079d8a03925002029bf6fa26649a59604d))
- **platform:** update path for route invalidation ([1f6b8a4](https://github.com/analogjs/analog/commit/1f6b8a42c1d1a1d1424c14e3eae088ca5d6bc515))
- **platform:** use slash in event handler for api middleware([#325](https://github.com/analogjs/analog/issues/325)) ([c8e65ea](https://github.com/analogjs/analog/commit/c8e65ea9dc8e50ffb5d8812ddc520d9e5a646f5f))
- **router:** lazy load markdown routes ([#233](https://github.com/analogjs/analog/issues/233)) ([16688e5](https://github.com/analogjs/analog/commit/16688e5e5c4dd3e98ff228819a30ee3e42a270ae)), closes [#200](https://github.com/analogjs/analog/issues/200)
- **router:** update regex to correctly parse catch-all routes ([#330](https://github.com/analogjs/analog/issues/330)) ([3c188ba](https://github.com/analogjs/analog/commit/3c188baa6f4aaebc2b7c8446d7f3002646e45403))
- **routes:** fix nested dynamic routes path ([#305](https://github.com/analogjs/analog/issues/305)) ([8abb61c](https://github.com/analogjs/analog/commit/8abb61c9104756c6ef416580dc65f8a2cfae80c6))
- simplify plugin flags ([ebd8e61](https://github.com/analogjs/analog/commit/ebd8e6192a5b363bd4f528e6b26cca82ed69f707))
- **vite-plugin-angular:** add check for undefined viteServer for build in test mode ([#279](https://github.com/analogjs/analog/issues/279)) ([301cffd](https://github.com/analogjs/analog/commit/301cffd1e211c8c650c4079345c96af6d02a5fa5))
- **vite-plugin-angular:** add condition for sass styles ([#186](https://github.com/analogjs/analog/issues/186)) ([6ec883a](https://github.com/analogjs/analog/commit/6ec883a3db2182d14777287cecf336e7076491af))
- **vite-plugin-angular:** add listeners to watch file add/deletion of files for compilation ([58d6732](https://github.com/analogjs/analog/commit/58d6732a59a654a7e9dc369c6fc4ca8710cfff1b))
- **vite-plugin-angular:** add plugin to remove inline resource imports ([#111](https://github.com/analogjs/analog/issues/111)) ([3ceb470](https://github.com/analogjs/analog/commit/3ceb470949b856ed1ca8cd5050e080a24bb1476b))
- **vite-plugin-angular:** add rxjs and rxjs/operators to dep optimizations ([#267](https://github.com/analogjs/analog/issues/267)) ([aa82373](https://github.com/analogjs/analog/commit/aa82373496cda99eb4eabffbb4c267da0c965292))
- **vite-plugin-angular:** add workspaceRoot to plugin options ([5b90fbc](https://github.com/analogjs/analog/commit/5b90fbc76cc2dc094b06ed6411f671a6bcaf9be3))
- **vite-plugin-angular:** allow build-angular v15 ([#162](https://github.com/analogjs/analog/issues/162)) ([3e56717](https://github.com/analogjs/analog/commit/3e567173ae10d5fa1a10246dbc14b40019aa1c83))
- **vite-plugin-angular:** always strip license comments from builds ([#29](https://github.com/analogjs/analog/issues/29)) ([5af9f28](https://github.com/analogjs/analog/commit/5af9f283c0cdb7a62df5805a799ef0744875f057))
- **vite-plugin-angular:** check for data query param for inlnine styles ([3c7ac2a](https://github.com/analogjs/analog/commit/3c7ac2af9180a89fb15666100f92bdc0a250207a))
- **vite-plugin-angular:** fix parsing of tsconfig option ([#135](https://github.com/analogjs/analog/issues/135)) ([a993a86](https://github.com/analogjs/analog/commit/a993a86eb68430e3ea4fc6c320b04ce2eaae19ad)), closes [#134](https://github.com/analogjs/analog/issues/134)
- **vite-plugin-angular:** fix resolution of external templates for builds ([#93](https://github.com/analogjs/analog/issues/93)) ([c99f0a0](https://github.com/analogjs/analog/commit/c99f0a00cafa5a55f1cd4669d14b065cbd92a4a4))
- **vite-plugin-angular:** mark plugin options as optional ([b4fc93a](https://github.com/analogjs/analog/commit/b4fc93ac8c5be767e39169bbabf3f3bc03c6b2f8))
- **vite-plugin-angular:** process/transform styles before Angular compilation ([#167](https://github.com/analogjs/analog/issues/167)) ([a2f3aa6](https://github.com/analogjs/analog/commit/a2f3aa6f9b34ee43f0d4b4c565cafa3b7869b9af)), closes [#142](https://github.com/analogjs/analog/issues/142)
- **vite-plugin-angular:** remove sass from resolve conditions ([a14df45](https://github.com/analogjs/analog/commit/a14df45cd03223d1a2957c1103dc1889a45e7d2d))
- **vite-plugin-angular:** remove sass from resolve conditions ([#177](https://github.com/analogjs/analog/issues/177)) ([f821d60](https://github.com/analogjs/analog/commit/f821d606895337ca2c0f6abf33b823dfcf256722))
- **vite-plugin-angular:** skip transforming inline scripts ([#98](https://github.com/analogjs/analog/issues/98)) ([d54258e](https://github.com/analogjs/analog/commit/d54258e4e91bff10ce2814487e9705b96d6c7005)), closes [#96](https://github.com/analogjs/analog/issues/96)
- **vite-plugin-angular:** support watch mode for multiple templateUrls ([#264](https://github.com/analogjs/analog/issues/264)) ([7f96057](https://github.com/analogjs/analog/commit/7f96057fdcd3d857106981ad36d5940f6c9e60ed)), closes [#257](https://github.com/analogjs/analog/issues/257)
- **vite-plugin-angular:** update plugin to ignore tsx files ([#102](https://github.com/analogjs/analog/issues/102)) ([8bf9854](https://github.com/analogjs/analog/commit/8bf98540608829046cbbe74d0b294d6dcb948201)), closes [#100](https://github.com/analogjs/analog/issues/100)
- **vite-plugin-angular:** use babel to make transform results compati… ([#231](https://github.com/analogjs/analog/issues/231)) ([c70e5dc](https://github.com/analogjs/analog/commit/c70e5dc9842503b808a10178f68823f28617fe74)), closes [#202](https://github.com/analogjs/analog/issues/202)

### Features

- add Angular Vite plugin and setup initial app ([6c9a98c](https://github.com/analogjs/analog/commit/6c9a98c27c07ca24098255ff833496976d8558a7))
- add create-analog package ([c9261a4](https://github.com/analogjs/analog/commit/c9261a4ce0f92571a62ef0b2b707165fafb3c50d))
- add SSR support for dev/build ([#182](https://github.com/analogjs/analog/issues/182)) ([965ed61](https://github.com/analogjs/analog/commit/965ed61ed59b9f77ab8699f4ea4c6d582ccbc609)), closes [#21](https://github.com/analogjs/analog/issues/21)
- add support for pages directory and .page.ts routes ([#281](https://github.com/analogjs/analog/issues/281)) ([4240cf5](https://github.com/analogjs/analog/commit/4240cf5f1df2cc7cc65f5f0398f4f959b9596689)), closes [#274](https://github.com/analogjs/analog/issues/274)
- **angular-vite-plugin:** add initial support for external styles/templates ([#9](https://github.com/analogjs/analog/issues/9)) ([e5c5da1](https://github.com/analogjs/analog/commit/e5c5da19f235b44cdedb6a59be7c46650e291533)), closes [#5](https://github.com/analogjs/analog/issues/5)
- **astro-angular:** add ability to pass vite options to integration ([#130](https://github.com/analogjs/analog/issues/130)) ([6769d1d](https://github.com/analogjs/analog/commit/6769d1dcf2ab4a9f534536343b2ee768b10cc355)), closes [#129](https://github.com/analogjs/analog/issues/129)
- **astro-angular:** add props (inputs) processing ([#67](https://github.com/analogjs/analog/issues/67)) ([2503e19](https://github.com/analogjs/analog/commit/2503e19adcd0b18f3be9f2c11ec3f1303eba8149)), closes [#60](https://github.com/analogjs/analog/issues/60)
- **astro-angular:** enabled angular prod build ([#66](https://github.com/analogjs/analog/issues/66)) ([b0235fc](https://github.com/analogjs/analog/commit/b0235fc4ad8b4a7fef9b0638f281a3236ab36178)), closes [#64](https://github.com/analogjs/analog/issues/64)
- **astro-angular:** update Astro integration with Angular v14.2 APIs ([#58](https://github.com/analogjs/analog/issues/58)) ([b385869](https://github.com/analogjs/analog/commit/b385869970daa0fcff64d93f6c9e91b75b5a2213)), closes [#24](https://github.com/analogjs/analog/issues/24)
- **astro-integration-angular:** move astro integration to analog monorepo ([#28](https://github.com/analogjs/analog/issues/28)) ([dfbd57b](https://github.com/analogjs/analog/commit/dfbd57b9cd6083e2328533f749d8de33d1be163c)), closes [#24](https://github.com/analogjs/analog/issues/24)
- change output directory from "server" to "analog" ([#300](https://github.com/analogjs/analog/issues/300)) ([2267afc](https://github.com/analogjs/analog/commit/2267afc58c2cff1fe0a44ad8d3a6153f7ab4eacc)), closes [#295](https://github.com/analogjs/analog/issues/295)
- **content:** add injectable token/service that provides list of content w/frontmatter ([#225](https://github.com/analogjs/analog/issues/225)) ([62aeb66](https://github.com/analogjs/analog/commit/62aeb6669637c9f1ac2fc0236acc3f46089257df)), closes [#222](https://github.com/analogjs/analog/issues/222)
- **content:** add slug to metadata based on filename ([#248](https://github.com/analogjs/analog/issues/248)) ([bf8581a](https://github.com/analogjs/analog/commit/bf8581ab9e7649aaa6111a7c9ae2523f0c5974cd)), closes [#247](https://github.com/analogjs/analog/issues/247)
- **content:** add support for accessing content files within nested folders ([#286](https://github.com/analogjs/analog/issues/286)) ([19acf0c](https://github.com/analogjs/analog/commit/19acf0cf6eeb3580949c14c47bcd6b4e0aede1fb)), closes [#282](https://github.com/analogjs/analog/issues/282)
- **content:** add support for front-matter in routes using markdown ([#205](https://github.com/analogjs/analog/issues/205)) ([5b4292a](https://github.com/analogjs/analog/commit/5b4292a2f0940341cc86d58c15b85b1a90b40b44)), closes [#198](https://github.com/analogjs/analog/issues/198)
- **content:** add support for lazy loading content files ([#235](https://github.com/analogjs/analog/issues/235)) ([4709629](https://github.com/analogjs/analog/commit/4709629caf6a9e5e9643d5bdd631460e949a0ff2)), closes [#234](https://github.com/analogjs/analog/issues/234)
- **content:** update injectContent function to return content object… ([#229](https://github.com/analogjs/analog/issues/229)) ([19beed1](https://github.com/analogjs/analog/commit/19beed10ea8fc7ec690c96e53b16290b53cebe0f)), closes [#228](https://github.com/analogjs/analog/issues/228)
- **content:** use angular router for internal links ([61813d0](https://github.com/analogjs/analog/commit/61813d04d98be761b29727cc6dc68a267cb22c17))
- **create-analog:** add angular 15 template ([#116](https://github.com/analogjs/analog/issues/116)) ([#158](https://github.com/analogjs/analog/issues/158)) ([df44122](https://github.com/analogjs/analog/commit/df441221cc51423d9a64f0d7cad64a8df8f0c466))
- **create-analog:** add git initialization after app creation ([aadf018](https://github.com/analogjs/analog/commit/aadf01835a0c6bfd184795a1f821baf8caec56c0))
- **create-analog:** add SSR support to v15 template app ([#190](https://github.com/analogjs/analog/issues/190)) ([08ff148](https://github.com/analogjs/analog/commit/08ff148798c033093d6e0ef6407aca8820fd26c9))
- **create-analog:** add tailwind gen to create-analog script ([#315](https://github.com/analogjs/analog/issues/315)) ([80fe21c](https://github.com/analogjs/analog/commit/80fe21cbe44451b703fce3db60658798c9454e54))
- **create-analog:** add template for Angular v16 pre-release ([#296](https://github.com/analogjs/analog/issues/296)) ([f7748b1](https://github.com/analogjs/analog/commit/f7748b1399ec5e7601a9421f9935834d1be93225))
- **create-analog:** set start command based on package manager ([#43](https://github.com/analogjs/analog/issues/43)) ([b9e5f28](https://github.com/analogjs/analog/commit/b9e5f2862e538f83ff3a1bf75e037dbfe5e70be3))
- **create-analog:** update Angular v15 template to use @nrwl/vite package ([#168](https://github.com/analogjs/analog/issues/168)) ([73b6180](https://github.com/analogjs/analog/commit/73b618035367d8903d86f6ba795ab34e136b53d3))
- enable ssr by default for analog platform plugin ([#301](https://github.com/analogjs/analog/issues/301)) ([95aa678](https://github.com/analogjs/analog/commit/95aa678e2b127b0067c840fdc7210a8afd55bd3d))
- introduce @analogjs/platform package for initial support for API routes ([#132](https://github.com/analogjs/analog/issues/132)) ([519c40c](https://github.com/analogjs/analog/commit/519c40cd863b0fca4919e37045ef71af61ce3235)), closes [#6](https://github.com/analogjs/analog/issues/6)
- introduce file-based @analogjs/router library ([#101](https://github.com/analogjs/analog/issues/101)) ([480e8e1](https://github.com/analogjs/analog/commit/480e8e12673fbf0f5508d5f8a39a925d8fca0718)), closes [#1](https://github.com/analogjs/analog/issues/1)
- move plugins under platform package ([#146](https://github.com/analogjs/analog/issues/146)) ([cbc0264](https://github.com/analogjs/analog/commit/cbc0264b02e61124ee8d21e37c300711a8f1bd19))
- **platform:** add initial Nx plugin support ([#308](https://github.com/analogjs/analog/issues/308)) ([3a84ced](https://github.com/analogjs/analog/commit/3a84ced3387ffc49d0e09dfe7a0f12d35785241f)), closes [#293](https://github.com/analogjs/analog/issues/293)
- **platform:** allow for configurable API route path prefix ([#319](https://github.com/analogjs/analog/issues/319)) ([26c78a1](https://github.com/analogjs/analog/commit/26c78a1f83010b10276a174c5a6b487f683555fb))
- **platform:** allow nx-plugin to be packaged with @analogjs/platform ([#313](https://github.com/analogjs/analog/issues/313)) ([c842919](https://github.com/analogjs/analog/commit/c8429195a6d1e62fd48a296b8b3ea45e372618ea))
- **platform:** update prerender option to discover and resolve routes ([#211](https://github.com/analogjs/analog/issues/211)) ([99a7bb2](https://github.com/analogjs/analog/commit/99a7bb29c2a68ebfc15b2d59ea5624762055d8f7))
- **router:** add ability to provide meta tags using RouteMeta ([#230](https://github.com/analogjs/analog/issues/230)) ([004289d](https://github.com/analogjs/analog/commit/004289da691890bf1a366b3da6bc323aed19b135)), closes [#214](https://github.com/analogjs/analog/issues/214)
- **router:** add experimental support for markdown as routes ([#185](https://github.com/analogjs/analog/issues/185)) ([55b1fde](https://github.com/analogjs/analog/commit/55b1fde37e501da59f05bf72bd41482f5a6331b0))
- **router:** add RouteMeta type ([f682c60](https://github.com/analogjs/analog/commit/f682c60c3d5b30c13aef2a71a8bf57f2e0c82ff9))
- **router:** add support for angular v15 ([c99a84c](https://github.com/analogjs/analog/commit/c99a84cda44b91c552f827a5e9bf5147e640849e))
- **router:** add support for named index routes ([#149](https://github.com/analogjs/analog/issues/149)) ([1dc54d2](https://github.com/analogjs/analog/commit/1dc54d21a4b8039e3ddea653259064eedf700c4c)), closes [#148](https://github.com/analogjs/analog/issues/148)
- **router:** deprecate defineRouteMeta in favor of RouteMeta ([5d94827](https://github.com/analogjs/analog/commit/5d948271fd5a80170d2cccfdb7ab9225b0701f3f)), closes [#223](https://github.com/analogjs/analog/issues/223)
- **router:** set title and meta tags for markdown pages ([#236](https://github.com/analogjs/analog/issues/236)) ([d6ef56b](https://github.com/analogjs/analog/commit/d6ef56b034ce3892e7ebf63da387844ce80ec7ae)), closes [#215](https://github.com/analogjs/analog/issues/215)
- update nitropack to 0.6.x ([#145](https://github.com/analogjs/analog/issues/145)) ([295bdac](https://github.com/analogjs/analog/commit/295bdac82ed2552499cd6cd55d72e7771f9a7698))
- update package.json deps for Angular v16 support ([#298](https://github.com/analogjs/analog/issues/298)) ([f1c25e4](https://github.com/analogjs/analog/commit/f1c25e4b125e991267ef7cab5b37142722135bda))
- update template application to use platform and router packages ([#147](https://github.com/analogjs/analog/issues/147)) ([c4f1619](https://github.com/analogjs/analog/commit/c4f1619efd7102cd5d33dde556d2327d953bff3d))
- upgrade dependencies to the latest Angular v16.0.0-next.7 release ([#322](https://github.com/analogjs/analog/issues/322)) ([0fe23c6](https://github.com/analogjs/analog/commit/0fe23c6c38180b37c65d75a750cd04696a20e3b9))
- **vite-angular-plugin:** update to Vite 3.0.x and Vitest 0.20.x ([#18](https://github.com/analogjs/analog/issues/18)) ([711bdae](https://github.com/analogjs/analog/commit/711bdae1250035da4fb9fe166ae18841f3b38b99)), closes [#7](https://github.com/analogjs/analog/issues/7)
- **vite-plugin-angular:** add caching to compilation host ([1331039](https://github.com/analogjs/analog/commit/13310390eee122ae8ab3c3c0e25063214d101da7))
- **vite-plugin-angular:** add optimizer plugin for builds ([b78cfad](https://github.com/analogjs/analog/commit/b78cfad3e8b49a1c04565a228022676c222d9b92))
- **vite-plugin-angular:** add support for css preprocessing in component styles ([#88](https://github.com/analogjs/analog/issues/88)) ([418c52e](https://github.com/analogjs/analog/commit/418c52ea534a6211eae96ac1d91a73063c45ae59)), closes [#82](https://github.com/analogjs/analog/issues/82)
- **vite-plugin-angular:** add support for Vitest and update create-analog template ([#15](https://github.com/analogjs/analog/issues/15)) ([b0fb790](https://github.com/analogjs/analog/commit/b0fb790a70379cec775c0c7d6f8a726a1a291fbd)), closes [#13](https://github.com/analogjs/analog/issues/13)
- **vite-plugin-angular:** add tsTransformers config ([#213](https://github.com/analogjs/analog/issues/213)) ([e733cd1](https://github.com/analogjs/analog/commit/e733cd1eb13ccb258542c8bea22d16ecb65355a5)), closes [#210](https://github.com/analogjs/analog/issues/210)
- **vite-plugin-angular:** change tsTransformers parameter type ([#221](https://github.com/analogjs/analog/issues/221)) ([3fd3ffa](https://github.com/analogjs/analog/commit/3fd3ffa0d4b311ceaad4f1e701636f9cd2e769d0))
- **vite-plugin-angular:** inline esbuild compiler plugin ([#252](https://github.com/analogjs/analog/issues/252)) ([8088439](https://github.com/analogjs/analog/commit/80884395dfc33520271da3eaba3bd342d4607ce8)), closes [#139](https://github.com/analogjs/analog/issues/139) [#2](https://github.com/analogjs/analog/issues/2)
- **vite-plugin-angular:** support Angular Material custom package.json exports ([#141](https://github.com/analogjs/analog/issues/141)) ([cee43a9](https://github.com/analogjs/analog/commit/cee43a996377765a1f3305e8c28cfa8993d2e4e3)), closes [#112](https://github.com/analogjs/analog/issues/112)

### Performance Improvements

- **vite-plugin-angular:** add perf changes from esbuild browser builder ([#27](https://github.com/analogjs/analog/issues/27)) ([168170f](https://github.com/analogjs/analog/commit/168170fd6c1d2ef452af1888c2efa3e2ce672874)), closes [#14](https://github.com/analogjs/analog/issues/14)

### BREAKING CHANGES

- **platform:** The `prerender` option has been renamed to `static`, and `prerender` is now a config object to auto-discover routes to be pre-rendered, and to add support for resolving additional routes async.

BEFORE:

```js
analog({
  prerender: true,
});
```

AFTER:

```js
analog({
  static: true,
  prerender: {
    discover: true,
    routes: async () => ['/', '/blog', '/extra/route'],
  },
});
```
