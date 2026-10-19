import { createHash } from 'node:crypto';
import { relative } from 'node:path';

// Intentionally dependency-light (node built-ins only): this module is loaded by
// the client scrub, so it must not drag in vite/nitro. POSIX-normalize inline.
const toPosix = (p: string): string => p.replace(/\\/g, '/');

/**
 * Server-function ids are derived, never author-chosen, for security:
 *
 * - **Collision-free.** `hash(fileId + exportName)` is unique per file+export, so
 *   two functions can never share a route and hijack each other's dispatch — a
 *   real risk with hand-picked ids where two authors independently pick `getUser`.
 * - **Non-enumerable.** The public route is an opaque digest, not a guessable
 *   verb like `/_analog/fn/deleteAccount`, shrinking the discoverable surface.
 * - **Not author-controlled.** Authors cannot expose a meaningful or duplicate
 *   route by accident; the id is a pure function of location.
 *
 * Both build transforms (server registration + client proxy) MUST derive the
 * same id, so this is the single source of truth for the algorithm and the
 * `fileId` must be the **project-root-relative** POSIX path — identical across
 * the client, SSR, and Nitro builds regardless of absolute checkout location.
 */

/** Project-root-relative POSIX module path used as the stable hash input. */
export function serverFnFileId(absPath: string, projectRoot: string): string {
  return toPosix(relative(projectRoot, absPath));
}

/**
 * Derives the opaque, collision-free id for a server function from its
 * project-root-relative file id and export name. 16 hex chars (64 bits) is far
 * beyond birthday-collision range for any realistic function count while keeping
 * the route short.
 */
export function deriveServerFnId(fileId: string, exportName: string): string {
  return createHash('sha256')
    .update(`${fileId}#${exportName}`)
    .digest('hex')
    .slice(0, 16);
}
