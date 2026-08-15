/**
 * Asserts what the Analog esbuild plugins produce through the real
 * Angular application builder. Run with `nx verify esbuild-app`, which
 * builds first.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// Same derivation the build transforms use: hash(projectRelativePath#export).
const fnId = (fileId, exportName) =>
  createHash('sha256')
    .update(`${fileId}#${exportName}`)
    .digest('hex')
    .slice(0, 16);
const GREETING_FN = fnId('src/app/lib/greeting.server.ts', 'getGreeting');
const ECHO_FN = fnId('src/app/lib/greeting.server.ts', 'echoLength');

const outDir = new URL('../../dist/apps/esbuild-app/', import.meta.url)
  .pathname;
const browserDir = join(outDir, 'browser');
const serverDir = join(outDir, 'server');

const read = (dir, file) => readFileSync(join(dir, file), 'utf8');
const jsFiles = (dir) =>
  readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));

/** The whole import.meta.env object is replaced, so esbuild emits a shim. */
function envOf(dir) {
  for (const file of jsFiles(dir)) {
    const match = read(dir, file).match(
      /define_import_meta_env_default = (\{[^}]*\})/,
    );
    if (match) return match[1];
  }
  return undefined;
}

const browserJs = jsFiles(browserDir).map((f) => read(browserDir, f));
const indexHtml = read(browserDir, 'index.html');
const aboutHtml = read(join(browserDir, 'about'), 'index.html');
const productOneHtml = read(join(browserDir, 'products/1'), 'index.html');

const checks = [
  [
    'route files discovered and code split per route',
    ['index-page', 'productId', 'about-md'].every((name) =>
      browserJs.some(
        (c) => c.includes(name) || c.includes(name.replace('-', '.')),
      ),
    ),
  ],
  [
    'pages compiled AOT by the Angular compiler',
    browserJs.some((c) => c.includes('ɵɵdefineComponent')),
  ],
  [
    'markdown rendered to HTML at build time with shiki highlighting',
    browserJs.some(
      (c) => c.includes('<h1 id="about">') && c.includes('class="shiki'),
    ),
  ],
  [
    'front matter preserved in content output',
    browserJs.some((c) => c.includes('title: About')),
  ],
  [
    // With analog.mermaid, mermaid fences skip highlighting and emit
    // as-is for client-side rendering.
    'mermaid fences pass through as pre.mermaid blocks',
    browserJs.some((c) => c.includes('<pre class="mermaid">')) &&
      aboutHtml.includes('<pre class="mermaid">'),
  ],
  [
    'browser bundle env is SSR: false',
    envOf(browserDir)?.includes('SSR: false'),
  ],
  ['server bundle env is SSR: true', envOf(serverDir)?.includes('SSR: true')],
  ['ssr renders the page component', indexHtml.includes('<h1>Home</h1>')],
  [
    'ssr renders markdown content',
    aboutHtml.includes('<h1 id="about">About</h1>') &&
      aboutHtml.includes('class="shiki'),
  ],
  [
    'ssr applies the front matter title',
    aboutHtml.includes('<title>About</title>'),
  ],
  ['ssr transfers state for hydration', aboutHtml.includes('id="ng-state"')],
  [
    // routeMeta.getPrerenderParams on [productId].page.ts lists 1 and 2,
    // surfaced through createServerRoutePaths.
    'parameterized route prerenders params from routeMeta',
    productOneHtml.includes('<h1>Product 1</h1>'),
  ],
  [
    // The marked heading-id slugger is stateful; without a reset per
    // render the same file gets different ids in each bundle.
    'heading ids match between the browser bundle and the ssr output',
    browserJs.some((c) => c.includes('<h1 id="about">')) &&
      aboutHtml.includes('<h1 id="about">'),
  ],
  [
    // The client scrub replaces serverFn modules with createServerFnRef
    // proxies; the handler body must not reach the browser.
    'server function handlers are scrubbed from the browser bundle',
    !browserJs.some((c) => c.includes('hello-from-server-fn')) &&
      browserJs.some((c) => c.includes(GREETING_FN)),
  ],
];

/**
 * Boots the built server entry and requests a route configured as
 * RenderMode.Server, which can only be produced per request.
 */
async function checkServer() {
  const port = 4173;
  const server = spawn(process.execPath, [join(outDir, 'server/server.mjs')], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });

  try {
    const base = `http://localhost:${port}`;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await fetch(base);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    const dynamic = await (await fetch(`${base}/products/42`)).text();
    const prerendered = await (await fetch(`${base}/about`)).text();

    return [
      [
        'server renders a parameterized route per request',
        dynamic.includes('ng-server-context="ssr"') &&
          dynamic.includes('<h1>Product 42</h1>'),
      ],
      [
        // provideServerRequestContext bridges BASE_URL from the Angular
        // request; prerendered pages have no request, so only the
        // per-request render carries it.
        'ssr bridges BASE_URL from the Angular request',
        dynamic.includes('data-base-url') && dynamic.includes(`>${base}</p>`),
      ],
      [
        'server serves prerendered routes as static output',
        prerendered.includes('ng-server-context="ssg"'),
      ],
      [
        // src/server/routes handlers served through @analogjs/router/api
        'api route serves JSON from the server entry',
        JSON.stringify(await (await fetch(`${base}/api/hello`)).json()) ===
          '{"message":"Hello Analog"}',
      ],
      [
        'api route resolves params with a method suffix',
        JSON.stringify(
          await (await fetch(`${base}/api/products/42`)).json(),
        ) === '{"id":"42"}',
      ],
      [
        // .server.ts page endpoints served at /api/_analog/pages/...
        'page endpoint GET runs the load function',
        (await (await fetch(`${base}/api/_analog/pages/feedback`)).json())
          .loaded === 'from-server-load',
      ],
      [
        // The action reads the form body and answers with the json()
        // helper (a web Response written through by h3).
        'page endpoint action handles a form post',
        JSON.stringify(
          await (
            await fetch(`${base}/api/_analog/pages/feedback`, {
              method: 'POST',
              headers: {
                'content-type': 'application/x-www-form-urlencoded',
              },
              body: 'comment=hi',
            })
          ).json(),
        ) === '{"saved":"hi"}',
      ],
      [
        // fail(422, …) carries the X-Analog-Errors header the FormAction
        // directive keys its error path on.
        'page endpoint action fails with status and error header',
        await (async () => {
          const res = await fetch(`${base}/api/_analog/pages/feedback`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'other=1',
          });
          return (
            res.status === 422 &&
            res.headers.get('x-analog-errors') === 'true' &&
            JSON.stringify(await res.json()) === '{"comment":"required"}'
          );
        })(),
      ],
      [
        // The load resolver self-fetches the page endpoint through
        // HttpClient and the bridged BASE_URL during SSR.
        'ssr resolves injectLoad data from the page endpoint',
        (await (await fetch(`${base}/feedback`)).text()).includes(
          'from-server-load',
        ),
      ],
      [
        // GET dispatch by the derived opaque id — registration (via
        // analog:server-fns) and the client proxy agree on the route.
        'server function dispatches over HTTP by derived id',
        JSON.stringify(
          await (await fetch(`${base}/_analog/fn/${GREETING_FN}`)).json(),
        ) === '{"greeting":"hello-from-server-fn"}',
      ],
      [
        'server function POST dispatch validates and returns JSON',
        JSON.stringify(
          await (
            await fetch(`${base}/_analog/fn/${ECHO_FN}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text: 'analog' }),
            })
          ).json(),
        ) === '{"length":6}',
      ],
      [
        // injectServerFn dispatches in-process through the
        // SERVER_FN_DISPATCHER bridge — against the synthetic request
        // during prerendering, so the value is baked into static output.
        'prerender resolves injectServerFn in-process',
        await (async () => {
          const html = await (await fetch(`${base}/fn-demo`)).text();
          return (
            html.includes('hello-from-server-fn') &&
            html.includes('ng-server-context="ssg"')
          );
        })(),
      ],
      [
        // withDebugRoutes reads the withRouteFiles map, so the debug
        // page lists the discovered files on the esbuild path too.
        'debug routes page lists discovered route files',
        await (async () => {
          const html = await (await fetch(`${base}/__analog/routes`)).text();
          return (
            html.includes('feedback.page') && html.includes('fn-demo.page')
          );
        })(),
      ],
    ];
  } finally {
    server.kill();
  }
}

checks.push(...(await checkServer()));

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
