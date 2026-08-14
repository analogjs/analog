import fs from 'node:fs';
import path from 'node:path';
import { defineWebSocketHandler } from 'nitro/h3';
import {
  createEntryId,
  summarizePayload,
  type TailwindDebugEventEntry,
  type TailwindDebugSocketMessage,
} from '../../../../app/debug/debug-stream.shared';

const WORKSPACE_ROOT = process.cwd();
const DEBUG_DIR = path.join(WORKSPACE_ROOT, 'tmp/debug');
const HMR_LOG_PATH = path.join(DEBUG_DIR, 'tailwind-debug-app.vite-hmr.log');
const WS_LOG_PATH = path.join(DEBUG_DIR, 'tailwind-debug-app.vite-ws.log');
const SNAPSHOT_LIMIT = 150;

type TailwindDebugPeer = {
  send: (message: string) => void;
  toString: () => string;
};

const peers = new Set<TailwindDebugPeer>();
const fileOffsets = new Map<string, number>();
const recentEntries: TailwindDebugEventEntry[] = [];
let watcher: fs.FSWatcher | undefined;

function appendRecentEntry(entry: TailwindDebugEventEntry) {
  recentEntries.push(entry);
  if (recentEntries.length > SNAPSHOT_LIMIT) {
    recentEntries.splice(0, recentEntries.length - SNAPSHOT_LIMIT);
  }
}

function parseLogLines(filePath: string, source: 'vite:hmr' | 'vite:ws') {
  if (!fs.existsSync(filePath)) {
    fileOffsets.set(filePath, 0);
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  fileOffsets.set(filePath, Buffer.byteLength(raw));

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      const firstSpace = line.indexOf(' ');
      if (firstSpace === -1) {
        return undefined;
      }

      const timestamp = line.slice(0, firstSpace);
      const body = line.slice(firstSpace + 1);

      try {
        const payload = JSON.parse(body);
        return {
          id: createEntryId(source, timestamp, `${index}`),
          payload,
          source,
          summary: summarizePayload(source, payload),
          timestamp,
        } satisfies TailwindDebugEventEntry;
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is TailwindDebugEventEntry => !!entry);
}

function loadSnapshot() {
  const entries = [
    ...parseLogLines(HMR_LOG_PATH, 'vite:hmr'),
    ...parseLogLines(WS_LOG_PATH, 'vite:ws'),
    ...recentEntries.filter((entry) => entry.source === 'browser'),
  ]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .slice(-SNAPSHOT_LIMIT);

  recentEntries.splice(0, recentEntries.length, ...entries);
  return entries;
}

function readNewEntries(filePath: string, source: 'vite:hmr' | 'vite:ws') {
  if (!fs.existsSync(filePath)) {
    fileOffsets.set(filePath, 0);
    return [];
  }

  const stat = fs.statSync(filePath);
  const previousOffset = fileOffsets.get(filePath) ?? 0;
  const start = stat.size < previousOffset ? 0 : previousOffset;
  const stream = fs.readFileSync(filePath, 'utf8');
  fileOffsets.set(filePath, Buffer.byteLength(stream));
  const delta = Buffer.from(stream).subarray(start).toString('utf8');

  if (!delta.trim()) {
    return [];
  }

  return delta
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      const firstSpace = line.indexOf(' ');
      if (firstSpace === -1) {
        return undefined;
      }

      const timestamp = line.slice(0, firstSpace);
      const body = line.slice(firstSpace + 1);

      try {
        const payload = JSON.parse(body);
        return {
          id: createEntryId(source, timestamp, `${start}:${index}`),
          payload,
          source,
          summary: summarizePayload(source, payload),
          timestamp,
        } satisfies TailwindDebugEventEntry;
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is TailwindDebugEventEntry => !!entry);
}

function broadcast(message: TailwindDebugSocketMessage) {
  const encoded = JSON.stringify(message);
  for (const peer of peers) {
    peer.send(encoded);
  }
}

function ensureWatcher() {
  if (watcher) {
    return;
  }

  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  loadSnapshot();

  watcher = fs.watch(DEBUG_DIR, (_eventType, filename) => {
    if (!filename) {
      return;
    }

    const resolved = path.join(DEBUG_DIR, filename.toString());
    const source =
      resolved === HMR_LOG_PATH
        ? 'vite:hmr'
        : resolved === WS_LOG_PATH
          ? 'vite:ws'
          : undefined;

    if (!source) {
      return;
    }

    const entries = readNewEntries(resolved, source);
    for (const entry of entries) {
      appendRecentEntry(entry);
      broadcast({
        entry,
        type: 'entry',
      });
    }
  });
}

function teardownWatcher() {
  if (peers.size > 0 || !watcher) {
    return;
  }

  watcher.close();
  watcher = undefined;
}

export default defineWebSocketHandler({
  open(peer) {
    const tailwindPeer = peer as unknown as TailwindDebugPeer;
    peers.add(tailwindPeer);
    ensureWatcher();

    tailwindPeer.send(
      JSON.stringify({
        entries: loadSnapshot(),
        type: 'snapshot',
      } satisfies TailwindDebugSocketMessage),
    );

    tailwindPeer.send(
      JSON.stringify({
        entry: {
          id: createEntryId(
            'system',
            new Date().toISOString(),
            peer.toString(),
          ),
          payload: {
            connections: peers.size,
            message: 'debug stream connected',
          },
          source: 'system',
          summary: 'debug stream connected',
          timestamp: new Date().toISOString(),
        },
        type: 'entry',
      } satisfies TailwindDebugSocketMessage),
    );
  },
  message(_peer, message) {
    try {
      const data = JSON.parse(message.text()) as TailwindDebugSocketMessage;
      if (data.type !== 'entry' || !data.entry) {
        return;
      }

      appendRecentEntry(data.entry);
      broadcast({
        entry: data.entry,
        type: 'entry',
      });
    } catch {
      // Ignore malformed browser diagnostic payloads.
    }
  },
  close(peer) {
    peers.delete(peer as unknown as TailwindDebugPeer);
    teardownWatcher();
  },
});
