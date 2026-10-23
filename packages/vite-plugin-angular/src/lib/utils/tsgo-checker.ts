import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface LspDiagnostic {
  range: { start: { line: number; character: number } };
  severity?: number;
  code?: number | string;
  message: string;
}

const IGNORED_TCB_CODES = new Set([6133, 6199, 2695, 7006]);
const BATCH_SIZE = 32;

function extractTcbSuffix(tcbCode: string): string {
  const tcbIndex = tcbCode.indexOf('/*tcb');
  if (tcbIndex === -1) return tcbCode;
  const header = tcbCode.slice(0, tcbIndex);
  const imports = header.match(/^import \* as _?i\d+ from [^\n]+$/gm) ?? [];
  return `${imports.join('\n')}\n${tcbCode.slice(tcbIndex)}`;
}

function resolveTsgoBinary(tsconfig: string): string {
  if (process.env['TSGO_BINARY_PATH']) return process.env['TSGO_BINARY_PATH'];
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    {
      parent: 'typescript/package.json',
      platform: `@typescript/typescript-${process.platform}-${process.arch}/package.json`,
      bin: `tsc${ext}`,
    },
    {
      parent: '@typescript/native-preview/package.json',
      platform: `@typescript/native-preview-${process.platform}-${process.arch}/package.json`,
      bin: `tsgo${ext}`,
    },
  ];
  for (const base of [tsconfig, import.meta.url]) {
    const req = createRequire(base);
    for (const candidate of candidates) {
      try {
        const parentPkg = req.resolve(candidate.parent);
        const platformPkg = createRequire(parentPkg).resolve(
          candidate.platform,
        );
        return resolve(dirname(platformPkg), 'lib', candidate.bin);
      } catch {
        // try next candidate
      }
    }
  }
  throw new Error(
    'disableTypeChecking: false requires TypeScript 7 (typescript@^7.0.0), @typescript/native-preview, or TSGO_BINARY_PATH.',
  );
}

export class TsgoChecker {
  private proc: ChildProcessWithoutNullStreams;
  private seq = 1;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  private versions = new Map<string, number>();
  private queued = new Map<
    string,
    { sourceCode: string; tcbCode?: string | null }
  >();
  private buffer = Buffer.alloc(0);
  readonly ready: Promise<void>;

  constructor(tsconfig: string) {
    const cwd = dirname(tsconfig);
    this.proc = spawn(resolveTsgoBinary(tsconfig), ['--lsp', '--stdio'], {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    this.proc.on('exit', (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`tsgo exited with code ${code}`));
      }
      this.pending.clear();
    });
    const rootUri = pathToFileURL(cwd).href;
    this.ready = this.request('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: { textDocument: { diagnostic: {} } },
      workspaceFolders: [{ uri: rootUri, name: 'root' }],
    }).then(() => this.notify('initialized', {}));
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const match = /Content-Length: (\d+)/i.exec(
        this.buffer.subarray(0, headerEnd).toString('utf8'),
      );
      if (!match) break;
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + Number(match[1]);
      if (this.buffer.length < bodyEnd) break;
      const msg = JSON.parse(
        this.buffer.subarray(bodyStart, bodyEnd).toString('utf8'),
      );
      this.buffer = this.buffer.subarray(bodyEnd);
      if (msg.id !== undefined && msg.method !== undefined) {
        this.send({ jsonrpc: '2.0', id: msg.id, result: null });
      } else if (msg.id !== undefined && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(msg.error.message));
        else entry.resolve(msg.result);
      }
    }
  }

  private send(payload: unknown) {
    const json = JSON.stringify(payload);
    this.proc.stdin.write(
      `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`,
    );
  }

  private notify(method: string, params: unknown) {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private request(method: string, params: unknown): Promise<any> {
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  updateDocument(filePath: string, text: string) {
    const uri = pathToFileURL(resolve(filePath)).href;
    const version = (this.versions.get(uri) ?? 0) + 1;
    this.versions.set(uri, version);
    if (version === 1) {
      this.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'typescript', version, text },
      });
    } else {
      this.notify('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    }
  }

  async checkFile(
    filePath: string,
    sourceLineCount?: number,
    lines?: string[],
  ): Promise<string[]> {
    const resolvedPath = resolve(filePath);
    const errors: string[] = [];
    const diag = await this.request('textDocument/diagnostic', {
      textDocument: { uri: pathToFileURL(resolvedPath).href },
    });
    for (const item of (diag?.items ?? []) as LspDiagnostic[]) {
      if (item.severity !== 1) continue;
      const line = item.range.start.line;
      if (sourceLineCount !== undefined && line >= sourceLineCount) {
        if (
          !IGNORED_TCB_CODES.has(Number(item.code)) &&
          !lines?.[line]?.includes('/*D:ignore*/')
        ) {
          errors.push(
            `${filePath} (template): error TS${item.code}: ${item.message}`,
          );
        }
      } else {
        errors.push(
          `${filePath}:${line + 1}:${item.range.start.character + 1} - error TS${item.code}: ${item.message}`,
        );
      }
    }
    return errors;
  }

  queueFile(filePath: string, sourceCode: string, tcbCode?: string | null) {
    this.queued.set(filePath, { sourceCode, tcbCode });
  }

  async flushQueue(watchMode = false): Promise<string[]> {
    if (this.queued.size === 0) return [];
    const entries = Array.from(this.queued.entries());
    this.queued.clear();
    await this.ready;
    const errors: string[] = [];
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const slice = entries.slice(i, i + BATCH_SIZE);
      const metas = slice.map(([filePath, { sourceCode, tcbCode }]) => {
        const sourceLineCount = sourceCode.split('\n').length;
        const combined = tcbCode
          ? `${sourceCode}\n${extractTcbSuffix(tcbCode)}`
          : sourceCode;
        const uri = pathToFileURL(resolve(filePath)).href;
        if (tcbCode || watchMode || this.versions.has(uri)) {
          this.updateDocument(filePath, combined);
        }
        return {
          filePath,
          sourceLineCount,
          lines: tcbCode ? combined.split('\n') : undefined,
        };
      });
      const batchResults = await Promise.all(
        metas.map(({ filePath, sourceLineCount, lines }) =>
          this.checkFile(filePath, sourceLineCount, lines),
        ),
      );
      for (const res of batchResults) {
        errors.push(...res);
      }
    }
    return errors;
  }

  close() {
    this.proc.kill();
  }
}
