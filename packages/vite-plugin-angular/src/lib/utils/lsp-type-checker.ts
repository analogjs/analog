import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';

interface LspDiagnostic {
  range: { start: { line: number; character: number } };
  severity?: number;
  code?: number | string;
  message: string;
}

// Same shape as NGP's `TcbTemplateSource`
export interface TcbTemplateSource {
  templateFile?: string;
  templateExpression?: { start: number; end: number };
}

type TemplateSources = Record<string, TcbTemplateSource>;

interface TcbLineRange {
  startLine: number;
  endLine: number;
  filePath: string;
  sourceCode: string;
  templateSources: TemplateSources;
}

interface FileMeta {
  filePath: string;
  sourceLineCount: number;
  lines?: string[];
  tcbRanges?: TcbLineRange[];
}

/** NGP's footer comment mapping TCB ids to the template they were generated from. */
export const TCB_TEMPLATE_SOURCES_PREFIX = 'ngp-tcb-template-sources:';

const IGNORED_TCB_CODES = new Set([6133, 6199, 2695, 7006]);
const BATCH_SIZE = 32;

const TCB_IMPORT_ALIAS = /^(?:_tcb_)?_?i\d+$/;
const TCB_LOCAL_NAME = /^(?:_tcb|_ctor|_pipe)\d+$/;
const SPAN_COMMENT = /^(\d+),(\d+)$/;

export function readSpanComment(
  value: string,
): { start: number; end: number } | null {
  const match = SPAN_COMMENT.exec(value);
  return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
}

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
  templateSources: TemplateSources;
}

// NGP places each block right after its class, so source can follow a block
function splitTcb(tcbCode: string): TcbParts | null {
  if (!tcbCode.includes('/*tcb')) return null;
  const { program, comments, errors } = parseSync('tcb.ts', tcbCode);
  if (errors.length > 0) return null;
  const parts: TcbParts = {
    source: [],
    imports: [],
    blocks: [],
    templateSources: {},
  };
  const footer = comments.find((c) =>
    c.value.startsWith(TCB_TEMPLATE_SOURCES_PREFIX),
  );
  if (footer) {
    parts.templateSources = JSON.parse(
      footer.value.slice(TCB_TEMPLATE_SOURCES_PREFIX.length),
    );
  }
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

function inPlaceDocument(
  filePath: string,
  sourceCode: string,
  tcbCode?: string | null,
): { text: string; meta: FileMeta } {
  const lines = sourceCode.split('\n');
  const sourceLineCount = lines.length;
  if (!tcbCode)
    return { text: sourceCode, meta: { filePath, sourceLineCount } };
  const parts = splitTcb(tcbCode);
  const suffix = parts
    ? [...parts.imports, ...parts.blocks]
        .map((stmt) => tcbCode.slice(stmt.start, stmt.end))
        .join('\n')
    : tcbCode;
  lines.push(...suffix.split('\n'));
  const range: TcbLineRange = {
    startLine: sourceLineCount,
    endLine: lines.length,
    filePath,
    sourceCode,
    templateSources: parts?.templateSources ?? {},
  };
  return {
    text: lines.join('\n'),
    meta: { filePath, sourceLineCount, lines, tcbRanges: [range] },
  };
}

function trailingSpan(
  text: string,
  pos: number,
  commentsByStart: Map<number, any>,
): { start: number; end: number } | null {
  while (true) {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    const comment = commentsByStart.get(pos);
    if (!comment) return null;
    const span = readSpanComment(comment.value);
    if (span) return span;
    pos = comment.end;
  }
}

function lineAndCharacter(text: string, offset: number) {
  const before = text.slice(0, offset).split('\n');
  return {
    line: before.length,
    character: before[before.length - 1].length + 1,
  };
}

// Mirrors ngtsc: the span comment trailing the innermost node at the diagnostic
function templateLocation(
  range: TcbLineRange,
  lines: string[],
  position: { line: number; character: number },
): { file: string; line: number; character: number } | null {
  const chunk = lines.slice(range.startLine, range.endLine).join('\n');
  let offset = position.character;
  for (let i = range.startLine; i < position.line; i++) {
    offset += lines[i].length + 1;
  }
  const { program, comments } = parseSync('tcb.ts', chunk);
  const commentsByStart = new Map(comments.map((c) => [c.start, c]));
  const ancestors: any[] = [];
  walk(program.body, (node) => {
    if (node.start <= offset && offset < node.end) ancestors.push(node);
  });
  const tcbFunction = ancestors.find(
    (node) =>
      node.type === 'FunctionDeclaration' && /_tcb\d+$/.test(node.id?.name),
  );
  let span: { start: number; end: number } | null = null;
  for (let i = ancestors.length - 1; i >= 0 && !span; i--) {
    span = trailingSpan(chunk, ancestors[i].end, commentsByStart);
  }
  if (!tcbFunction || !span) return null;

  const id = /(tcb\d+)$/.exec(tcbFunction.id.name)![1];
  const source = range.templateSources[id];
  const file = source?.templateFile ?? range.filePath;
  let content = range.sourceCode;
  if (source?.templateFile) {
    try {
      content = readFileSync(source.templateFile, 'utf-8');
    } catch {
      return null;
    }
  }
  const start = source?.templateExpression?.start ?? span.start;
  return { file, ...lineAndCharacter(content, start) };
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
): { body: string; templateSources: TemplateSources } | null {
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

  return {
    body: parts.blocks.map((stmt) => ms.slice(stmt.start, stmt.end)).join('\n'),
    templateSources: parts.templateSources,
  };
}

export type TypeCheckerOption =
  | 'tsgo'
  | 'tsrs'
  | { command: string; args?: string[] };

interface TypeCheckerCommand {
  command: string;
  args: string[];
}

const LSP_ARGS = ['--lsp', '--stdio'];

function resolveTsgoBinary(tsconfig: string): string {
  if (process.env['TSNATIVE_BINARY_PATH'])
    return process.env['TSNATIVE_BINARY_PATH'];
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
    'disableTypeChecking: false requires TypeScript 7 (typescript@^7.0.0), @typescript/native-preview, or TSNATIVE_BINARY_PATH.',
  );
}

// Run tsrs through its launcher, which selects the platform binary.
function resolveTsrs(tsconfig: string): TypeCheckerCommand {
  for (const base of [tsconfig, import.meta.url]) {
    try {
      const pkg = createRequire(base).resolve('tsrs/package.json');
      return {
        command: process.execPath,
        args: [resolve(dirname(pkg), 'bin', 'tsrs'), ...LSP_ARGS],
      };
    } catch {
      // try next base
    }
  }
  throw new Error("typeChecker: 'tsrs' requires the tsrs package.");
}

export function resolveTypeChecker(
  tsconfig: string,
  option: TypeCheckerOption,
): TypeCheckerCommand {
  if (typeof option === 'object') {
    return { command: option.command, args: option.args ?? LSP_ARGS };
  }
  if (option === 'tsrs') return resolveTsrs(tsconfig);
  return { command: resolveTsgoBinary(tsconfig), args: LSP_ARGS };
}

export class LspTypeChecker {
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
  private exitError: Error | undefined;
  readonly ready: Promise<void>;

  constructor(tsconfig: string, option: TypeCheckerOption = 'tsgo') {
    const cwd = dirname(tsconfig);
    const { command, args } = resolveTypeChecker(tsconfig, option);
    this.proc = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    const fail = (error: Error) => {
      this.exitError ??= error;
      for (const { reject } of this.pending.values()) reject(this.exitError);
      this.pending.clear();
    };
    this.proc.on('error', fail);
    this.proc.stdin.on('error', fail);
    this.proc.on('exit', (code) =>
      fail(new Error(`type checker exited with code ${code}`)),
    );
    const rootUri = pathToFileURL(cwd).href;
    this.ready = this.request('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: { textDocument: { diagnostic: {} } },
      workspaceFolders: [{ uri: rootUri, name: 'root' }],
    }).then(() => this.notify('initialized', {}));
    this.ready.catch(() => {});
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
    if (this.exitError) return Promise.reject(this.exitError);
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  updateDocument(filePath: string, text: string) {
    const uri = pathToFileURL(resolve(filePath)).href;
    if (!this.versions.has(uri)) {
      // tsgo 7.0.0-dev.20260412 ignores didOpen text once other documents are open
      this.versions.set(uri, 1);
      this.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'typescript', version: 1, text },
      });
    }
    const version = this.versions.get(uri)! + 1;
    this.versions.set(uri, version);
    this.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
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
          const range = tcbRanges?.find(
            (r) => line >= r.startLine && line < r.endLine,
          );
          const location =
            range && lines && templateLocation(range, lines, item.range.start);
          errors.push(
            location
              ? `${location.file}:${location.line}:${location.character} - error TS${item.code}: ${item.message}`
              : `${range?.filePath ?? filePath} (template): error TS${item.code}: ${item.message}`,
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

    const metas: FileMeta[] = [];
    let updatesCount = 0;
    const update = async (filePath: string, text: string) => {
      this.updateDocument(filePath, text);
      updatesCount++;
      if (updatesCount % BATCH_SIZE === 0) {
        await new Promise((r) => setTimeout(r, 5));
      }
    };

    if (!watchMode && entries.length > 1) {
      const [hostFilePath, hostItem] = entries[0];
      const hostDir = dirname(resolve(hostFilePath));
      const hostUri = pathToFileURL(resolve(hostFilePath)).href;
      const sharedImports = new Map<string, string>();
      const relocatedChunks: Array<{
        filePath: string;
        sourceCode: string;
        body: string;
        templateSources: TemplateSources;
      }> = [];
      let hostRelocated = false;

      for (let i = 0; i < entries.length; i++) {
        const [filePath, { sourceCode, tcbCode }] = entries[i];
        const uri = pathToFileURL(resolve(filePath)).href;
        if (tcbCode && !this.versions.has(uri)) {
          const relocated = relocateTcb(
            filePath,
            tcbCode,
            hostDir,
            i,
            sharedImports,
          );
          if (relocated !== null) {
            relocatedChunks.push({ filePath, sourceCode, ...relocated });
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

        const { text, meta } = inPlaceDocument(filePath, sourceCode, tcbCode);
        if (tcbCode || this.versions.has(uri)) await update(filePath, text);
        metas.push(meta);
      }

      const { meta: hostMeta } = inPlaceDocument(
        hostFilePath,
        hostItem.sourceCode,
        hostRelocated ? null : hostItem.tcbCode,
      );
      const hostLines = hostMeta.lines ?? hostItem.sourceCode.split('\n');
      const hostTcbRanges = hostMeta.tcbRanges ?? [];

      if (relocatedChunks.length > 0) {
        for (const [spec, alias] of sharedImports) {
          hostLines.push(`import * as ${alias} from '${spec}';`);
        }
        for (const {
          filePath,
          sourceCode,
          body,
          templateSources,
        } of relocatedChunks) {
          const startLine = hostLines.length;
          hostLines.push(...body.split('\n'));
          hostTcbRanges.push({
            startLine,
            endLine: hostLines.length,
            filePath,
            sourceCode,
            templateSources,
          });
        }
      }

      const hasHostTcb = hostTcbRanges.length > 0;
      if (hasHostTcb || this.versions.has(hostUri)) {
        this.updateDocument(hostFilePath, hostLines.join('\n'));
      }
      metas.unshift({
        filePath: hostFilePath,
        sourceLineCount: hostMeta.sourceLineCount,
        lines: hasHostTcb ? hostLines : undefined,
        tcbRanges: hasHostTcb ? hostTcbRanges : undefined,
      });
    } else {
      for (const [filePath, { sourceCode, tcbCode }] of entries) {
        const { text, meta } = inPlaceDocument(filePath, sourceCode, tcbCode);
        const uri = pathToFileURL(resolve(filePath)).href;
        if (tcbCode || watchMode || this.versions.has(uri)) {
          await update(filePath, text);
        }
        metas.push(meta);
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
