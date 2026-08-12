#!/usr/bin/env node
/**
 * Renders the site-wide Open Graph / Twitter card image.
 *
 * The card is plain HTML rendered at 1200x630 by Playwright/Chromium, so the
 * design can be edited here and regenerated instead of round-tripping through
 * a design tool.
 *
 * Usage:
 *   node scripts/og-image.mjs [--out=<file>]
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1200;
const HEIGHT = 630;

const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
const out = outArg
  ? resolve(process.cwd(), outArg.slice(6))
  : resolve(APP_ROOT, 'public/img/og-image.png');

const logo = readFileSync(
  resolve(APP_ROOT, 'public/img/logos/analog-logo.svg'),
  'utf8',
).replace(/<\?xml[^>]*\?>/, '');

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        position: relative;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 76px 80px;
        background: #011627;
        background-image:
          radial-gradient(900px 520px at 88% 12%, rgba(195, 15, 46, 0.28), transparent 70%),
          radial-gradient(700px 460px at 4% 96%, rgba(124, 58, 237, 0.2), transparent 70%);
        font-family: 'Liberation Sans', Arial, Helvetica, sans-serif;
        color: #ffffff;
        overflow: hidden;
      }
      .mark { display: flex; align-items: center; gap: 20px; }
      .mark svg { width: 68px; height: auto; display: block; }
      .mark span { font-size: 42px; font-weight: 700; letter-spacing: -0.02em; }
      h1 {
        max-width: 1040px;
        font-size: 80px;
        font-weight: 700;
        line-height: 1.08;
        letter-spacing: -0.03em;
        background: linear-gradient(120deg, #fb7185, #e879f9 55%, #a78bfa);
        -webkit-background-clip: text;
        color: transparent;
      }
      .glyph {
        position: absolute;
        right: -70px;
        bottom: 110px;
        opacity: 0.12;
      }
      .glyph svg { width: 360px; height: auto; display: block; }
      .rule {
        width: 100%;
        height: 4px;
        border-radius: 4px;
        background: linear-gradient(90deg, #c30f2e, #e879f9, transparent);
      }
    </style>
  </head>
  <body>
    <div class="mark">${logo}<span>Analog</span></div>
    <h1>The fullstack<br />Angular meta-framework</h1>
    <div class="glyph">${logo}</div>
    <div class="rule"></div>
  </body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: out });
await browser.close();

console.log(`✓ wrote ${out}`);
