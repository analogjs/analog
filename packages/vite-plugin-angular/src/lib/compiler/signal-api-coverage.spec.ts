import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SIGNAL_APIS } from './constants';

/**
 * Drift detector for signal / initializer authoring APIs against upstream
 * `angular/angular`.
 *
 * The fast-compile path extracts metadata for signal-based members (inputs,
 * outputs, queries) by matching the initializer call against {@link SIGNAL_APIS}
 * (see `metadata.ts`). If Angular adds a new initializer API and the set does
 * not grow with it, members declared with the new API silently lose their
 * metadata — broken inputs/outputs/queries at runtime.
 *
 * ngtsc's canonical list lives in the `InitializerApiFunction['functionName']`
 * union, which is the authoritative source the Angular compiler itself uses.
 */
const ANGULAR_ROOT =
  process.env.ANGULAR_SOURCE_DIR ||
  path.resolve(process.env.HOME ?? '', 'projects/angular/angular');
const INITIALIZER_FNS_FILE = path.join(
  ANGULAR_ROOT,
  'packages/compiler-cli/src/ngtsc/annotations/directive/src/initializer_functions.ts',
);

function upstreamInitializerApis(): Set<string> {
  const code = fs.readFileSync(INITIALIZER_FNS_FILE, 'utf-8');
  const union = code.match(/functionName:\s*([^;]+);/);
  const names = new Set<string>();
  if (union) {
    for (const m of union[1].matchAll(/'([A-Za-z]+)'/g)) names.add(m[1]);
  }
  return names;
}

describe.skipIf(!fs.existsSync(INITIALIZER_FNS_FILE))(
  'Angular signal/initializer API coverage (upstream drift)',
  () => {
    it('SIGNAL_APIS covers every initializer API ngtsc recognizes', () => {
      const upstream = upstreamInitializerApis();

      // Guard against a vacuous pass if the upstream union shape changed.
      expect(
        upstream.has('input') && upstream.has('output'),
        `No initializer APIs parsed from ${INITIALIZER_FNS_FILE}; the upstream ` +
          `\`InitializerApiFunction\` shape changed — update this detector.`,
      ).toBe(true);

      const missing = [...upstream].filter((api) => !SIGNAL_APIS.has(api));
      expect(
        missing,
        `ngtsc recognizes initializer API(s) the fast compiler does not ` +
          `extract: [${missing.join(', ')}]. Add them to SIGNAL_APIS in ` +
          `compiler/constants.ts, or signal inputs/outputs/queries declared ` +
          `with them lose their metadata.`,
      ).toEqual([]);
    });
  },
);
