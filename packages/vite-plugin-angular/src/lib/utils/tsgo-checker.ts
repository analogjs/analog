import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';

interface LspDiagnostic {
  range: { start: { line: number; character: number } };
  severity?: number;
  code?: number | string;
  message: string;
}

interface TcbLineRange {
  startLine: number;
  endLine: number;
  filePath: string;
}

const IGNORED_TCB_CODES = new Set([6133, 6199, 2695, 7006]);
const BATCH_SIZE = 32;

const TCB_IMPORT_ALIAS = /^(?:_tcb_)?_?i\d+$/;
const TCB_LOCAL_NAME = /^(?:_tcb|_ctor|_pipe)\d+$/;

function walk(node: any, visit: (node: any) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key in node) {
    const value = node[key];
    if (value && typeof value === 'object') walk(value, visit);
  }
}

function declaredName(stmt: any): string | undefined {
  if (stmt.type === 'VariableDeclaration')
    return stmt.declarations[0]?.id?.name;
  if (stmt.type === 'FunctionDeclaration' || stmt.type === 'TSDeclareFunction')
    return stmt.id?.name;
  return undefined;
}

function isTcbImport(stmt: any): boolean {
  const ns = stmt.type === 'ImportDeclaration' && stmt.specifiers[0];
  return (
    ns?.type === 'ImportNamespaceSpecifier' &&
    TCB_IMPORT_ALIAS.test(ns.local.name)
  );
}

interface TcbParts {
  source: any[];
  imports: any[];
  blocks: any[];
}

// NGP places each block right after its class, so source can follow a block
function splitTcb(tcbCode: string): TcbParts | null {
  if (!tcbCode.includes('/*tcb')) return null;
  const { program, errors } = parseSync('tcb.ts', tcbCode);
  if (errors.length > 0) return null;
  const parts: TcbParts = { source: [], imports: [], blocks: [] };
  for (const stmt of program.body) {
    if (TCB_LOCAL_NAME.test(declaredName(stmt) ?? '')) {
      parts.blocks.push(stmt);
    } else {
      parts.source.push(stmt);
      if (isTcbImport(stmt)) parts.imports.push(stmt);
    }
  }
  return parts.blocks.length > 0 ? parts : null;
}

function extractTcbSuffix(tcbCode: string): string {
  const parts = splitTcb(tcbCode);
  if (!parts) return tcbCode;
  return [...parts.imports, ...parts.blocks]
    .map((stmt) => tcbCode.slice(stmt.start, stmt.end))
    .join('\n');
}

function isBareTypeReference(type: any): boolean {
  return (
    type?.type === 'TSTypeReference' && type.typeName.type === 'Identifier'
  );
}

function collectExportedClasses(header: any[]): Map<string, string> {
  const exported = new Map<string, string>();
  for (const stmt of header) {
    const cls = stmt.declaration;
    if (cls?.type !== 'ClassDeclaration' || !cls.id) continue;
    if (stmt.type === 'ExportDefaultDeclaration') {
      exported.set(cls.id.name, 'default');
    } else if (stmt.type === 'ExportNamedDeclaration') {
      exported.set(cls.id.name, cls.id.name);
    }
  }
  return exported;
}

function hostRelativeSpecifier(absPath: string, hostDir: string): string {
  const spec = relative(hostDir, absPath).replace(/\\/g, '/');
  return spec.startsWith('.') ? spec : './' + spec;
}

function sharedAliasFor(spec: string, sharedImports: Map<string, string>) {
  let alias = sharedImports.get(spec);
  if (!alias) {
    alias = `_si${sharedImports.size}`;
    sharedImports.set(spec, alias);
  }
  return alias;
}

function relocateTcb(
  filePath: string,
  tcbCode: string,
  hostDir: string,
  fileIdx: number,
  sharedImports: Map<string, string>,
): string | null {
  const parts = splitTcb(tcbCode);
  if (!parts) return null;

  const aliasSpecs = new Map<string, string>();
  for (const stmt of parts.imports) {
    aliasSpecs.set(stmt.specifiers[0].local.name, stmt.source.value);
  }

  const exportedClasses = collectExportedClasses(parts.source);
  const identifiers: any[] = [];
  const thisTypes: Array<{ node: any; exportProp: string }> = [];
  let relocatable = true;

  walk(parts.blocks, (node) => {
    if (node.type === 'Identifier') {
      identifiers.push(node);
      return;
    }
    // Same-file directives or pipes have no namespace import to relocate
    if (
      (node.type === 'VariableDeclarator' &&
        /^_pipe\d+$/.test(node.id.name) &&
        isBareTypeReference(node.init?.typeAnnotation)) ||
      (node.type === 'TSFunctionType' &&
        node.params[0]?.name === 'init' &&
        isBareTypeReference(node.returnType?.typeAnnotation))
    ) {
      relocatable = false;
      return;
    }
    if (node.type !== 'FunctionDeclaration' || !/^_tcb\d+$/.test(node.id?.name))
      return;
    const thisType = node.params[0]?.typeAnnotation?.typeAnnotation;
    if (node.params[0]?.name !== 'this' || !isBareTypeReference(thisType))
      return;
    const exportProp = exportedClasses.get(thisType.typeName.name);
    if (node.typeParameters || !exportProp) {
      relocatable = false;
      return;
    }
    thisTypes.push({ node: thisType.typeName, exportProp });
  });
  if (!relocatable) return null;

  const fileDir = dirname(resolve(filePath));
  const aliasMap = new Map<string, string>();
  for (const [alias, rawSpec] of aliasSpecs) {
    const spec = rawSpec.startsWith('.')
      ? hostRelativeSpecifier(resolve(fileDir, rawSpec), hostDir)
      : rawSpec;
    aliasMap.set(alias, sharedAliasFor(spec, sharedImports));
  }

  const ms = new MagicString(tcbCode);
  for (const node of identifiers) {
    if (TCB_LOCAL_NAME.test(node.name)) {
      ms.overwrite(node.start, node.end, `_f${fileIdx}_${node.name}`);
    } else if (aliasMap.has(node.name)) {
      ms.overwrite(node.start, node.end, aliasMap.get(node.name)!);
    }
  }
  if (thisTypes.length > 0) {
    const selfSpec = hostRelativeSpecifier(
      resolve(filePath).replace(/\.[cm]?tsx?$/, ''),
      hostDir,
    );
    const selfAlias = sharedAliasFor(selfSpec, sharedImports);
    for (const { node, exportProp } of thisTypes) {
      ms.overwrite(node.start, node.end, `${selfAlias}.${exportProp}`);
    }
  }

  return parts.blocks.map((stmt) => ms.slice(stmt.start, stmt.end)).join('\n');
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
    tcbRanges?: TcbLineRange[],
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
          const ownerFile =
            tcbRanges?.find((r) => line >= r.startLine && line < r.endLine)
              ?.filePath ?? filePath;
          errors.push(
            `${ownerFile} (template): error TS${item.code}: ${item.message}`,
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

    const metas: Array<{
      filePath: string;
      sourceLineCount: number;
      lines?: string[];
      tcbRanges?: TcbLineRange[];
    }> = [];
    let updatesCount = 0;

    if (!watchMode && entries.length > 1) {
      const [hostFilePath, hostItem] = entries[0];
      const hostDir = dirname(resolve(hostFilePath));
      const hostUri = pathToFileURL(resolve(hostFilePath)).href;
      const sharedImports = new Map<string, string>();
      const relocatedChunks: Array<{ filePath: string; body: string }> = [];
      let hostRelocated = false;

      for (let i = 0; i < entries.length; i++) {
        const [filePath, { sourceCode, tcbCode }] = entries[i];
        const uri = pathToFileURL(resolve(filePath)).href;
        if (tcbCode && !this.versions.has(uri)) {
          const body = relocateTcb(
            filePath,
            tcbCode,
            hostDir,
            i,
            sharedImports,
          );
          if (body !== null) {
            relocatedChunks.push({ filePath, body });
            if (i === 0) {
              hostRelocated = true;
            } else {
              metas.push({
                filePath,
                sourceLineCount: sourceCode.split('\n').length,
              });
            }
            continue;
          }
        }
        if (i === 0) continue;

        const sourceLineCount = sourceCode.split('\n').length;
        const combined = tcbCode
          ? `${sourceCode}\n${extractTcbSuffix(tcbCode)}`
          : sourceCode;
        if (tcbCode || this.versions.has(uri)) {
          this.updateDocument(filePath, combined);
          updatesCount++;
          if (updatesCount % BATCH_SIZE === 0) {
            await new Promise((r) => setTimeout(r, 5));
          }
        }
        metas.push({
          filePath,
          sourceLineCount,
          lines: tcbCode ? combined.split('\n') : undefined,
        });
      }

      const hostLines = hostItem.sourceCode.split('\n');
      const hostSourceLineCount = hostLines.length;
      const hostTcbRanges: TcbLineRange[] = [];

      if (hostItem.tcbCode && !hostRelocated) {
        const startLine = hostLines.length;
        hostLines.push(...extractTcbSuffix(hostItem.tcbCode).split('\n'));
        hostTcbRanges.push({
          startLine,
          endLine: hostLines.length,
          filePath: hostFilePath,
        });
      }

      if (relocatedChunks.length > 0) {
        for (const [spec, alias] of sharedImports) {
          hostLines.push(`import * as ${alias} from '${spec}';`);
        }
        for (const { filePath, body } of relocatedChunks) {
          const startLine = hostLines.length;
          hostLines.push(...body.split('\n'));
          hostTcbRanges.push({
            startLine,
            endLine: hostLines.length,
            filePath,
          });
        }
      }

      const hasHostTcb = hostTcbRanges.length > 0;
      if (hasHostTcb || this.versions.has(hostUri)) {
        this.updateDocument(hostFilePath, hostLines.join('\n'));
      }
      metas.unshift({
        filePath: hostFilePath,
        sourceLineCount: hostSourceLineCount,
        lines: hasHostTcb ? hostLines : undefined,
        tcbRanges: hasHostTcb ? hostTcbRanges : undefined,
      });
    } else {
      for (const [filePath, { sourceCode, tcbCode }] of entries) {
        const sourceLineCount = sourceCode.split('\n').length;
        const combined = tcbCode
          ? `${sourceCode}\n${extractTcbSuffix(tcbCode)}`
          : sourceCode;
        const uri = pathToFileURL(resolve(filePath)).href;
        if (tcbCode || watchMode || this.versions.has(uri)) {
          this.updateDocument(filePath, combined);
          updatesCount++;
          if (updatesCount % BATCH_SIZE === 0) {
            await new Promise((r) => setTimeout(r, 5));
          }
        }
        metas.push({
          filePath,
          sourceLineCount,
          lines: tcbCode ? combined.split('\n') : undefined,
        });
      }
    }

    const errors: string[] = [];
    const first = metas[0];
    errors.push(
      ...(await this.checkFile(
        first.filePath,
        first.sourceLineCount,
        first.lines,
        first.tcbRanges,
      )),
    );

    for (let i = 1; i < metas.length; i += BATCH_SIZE) {
      const slice = metas.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        slice.map(({ filePath, sourceLineCount, lines, tcbRanges }) =>
          this.checkFile(filePath, sourceLineCount, lines, tcbRanges),
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
