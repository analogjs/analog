/**
 * Background worker thread for parallel Angular template type checking.
 *
 * Runs ngtsc's NgtscProgram in diagnostic-only mode (no emit) and queries
 * NgCompiler.getDiagnosticsForFile() per file using OptimizeFor.SingleFile
 * for per-transform updates, OptimizeFor.WholeProgram for unscoped checks.
 *
 * A file-keyed diagnostic cache preserves cumulative visibility: per-file
 * checks update only their own slot, so errors elsewhere in the project
 * stay reported until the file producing them is rechecked.
 *
 * Communication protocol:
 *   Parent → Worker:  { type: 'init', tsconfig: string }
 *   Parent → Worker:  { type: 'check', files?: string[] }
 *   Parent → Worker:  { type: 'shutdown' }
 *   Worker → Parent:  { type: 'diagnostics', diagnostics: SerializedDiagnostic[] }
 *   Worker → Parent:  { type: 'error', message: string }
 *   Worker → Parent:  { type: 'ready' }
 */

import { parentPort } from 'node:worker_threads';
import * as ts from 'typescript';

export interface SerializedDiagnostic {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  category: 'error' | 'warning' | 'suggestion';
  code: number;
}

interface InitMessage {
  type: 'init';
  tsconfig: string;
}

interface CheckMessage {
  type: 'check';
  files?: string[];
}

interface ShutdownMessage {
  type: 'shutdown';
}

type WorkerMessage = InitMessage | CheckMessage | ShutdownMessage;

let compilerCli: typeof import('@angular/compiler-cli');
let OptimizeFor: typeof import('@angular/compiler-cli').OptimizeFor;
let program: any; // NgtscProgram
let tsCompilerOptions: ts.CompilerOptions;
let tsconfigPath: string;
let host: ts.CompilerHost;
let initialized = false;

/** Per-file diagnostic cache. Key is absolute file path. */
const diagnosticCache = new Map<string, SerializedDiagnostic[]>();
/** Diagnostics not bound to a source file (rare — fatal compiler errors). */
let unscopedDiagnostics: SerializedDiagnostic[] = [];

/** Debounce: delay check until no new messages arrive for this many ms. */
const DEBOUNCE_MS = 300;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Tracks whether a check is currently running to avoid overlapping rebuilds. */
let checking = false;
/** Set when a check is requested while one is already running. */
let dirty = false;
/** Files queued for checking while a check is already running. null = whole program. */
let pendingFiles: Set<string> | null = null;

async function init(tsconfig: string) {
  compilerCli = await import('@angular/compiler-cli');
  OptimizeFor = compilerCli.OptimizeFor;
  tsconfigPath = tsconfig;

  const config = compilerCli.readConfiguration(tsconfig, {
    suppressOutputPathCheck: true,
    outDir: undefined,
    sourceMap: false,
    declaration: false,
    declarationMap: false,
    noEmitOnError: false,
    noEmit: true,
  });

  tsCompilerOptions = config.options;
  host = ts.createCompilerHost(tsCompilerOptions);

  const rootNames = config.rootNames;
  await rebuildProgram(rootNames);
  initialized = true;
  parentPort?.postMessage({ type: 'ready' });
}

/**
 * Re-read rootNames from tsconfig so file additions/deletions are picked up,
 * then rebuild the NgtscProgram for a fresh analysis pass. The prior program
 * is passed as `nextProgram` so ngtsc reuses unchanged source files.
 */
async function rebuildProgram(rootNamesOverride?: string[]): Promise<void> {
  const rootNames =
    rootNamesOverride ?? compilerCli.readConfiguration(tsconfigPath).rootNames;

  const NgtscProgram = compilerCli.NgtscProgram;
  program = new NgtscProgram(rootNames, tsCompilerOptions, host, program);
  await program.compiler.analyzeAsync();
}

/**
 * Resolve the set of files we want to check. Uses the program's full source
 * file list (not just rootNames) so files reachable transitively — e.g. an
 * `app.component.ts` imported from `main.ts` — are included even when the
 * tsconfig only lists entry points.
 */
function getCheckableFiles(tsProgram: ts.Program): string[] {
  return tsProgram
    .getSourceFiles()
    .filter(
      (sf) => !sf.isDeclarationFile && !sf.fileName.includes('/node_modules/'),
    )
    .map((sf) => sf.fileName);
}

async function check(targetFiles: Set<string> | null) {
  if (!initialized) {
    parentPort?.postMessage({
      type: 'error',
      message: 'Worker not initialized. Send init message first.',
    });
    return;
  }

  try {
    await rebuildProgram();
    const compiler = program.compiler;
    const tsProgram: ts.Program = compiler.getCurrentProgram();

    const allFiles = getCheckableFiles(tsProgram);
    const filesToCheck = targetFiles
      ? allFiles.filter((f) => targetFiles.has(f))
      : allFiles;
    const optimizeFor = targetFiles
      ? OptimizeFor.SingleFile
      : OptimizeFor.WholeProgram;

    // Drop cache entries for files no longer in the program (deleted or
    // unreachable). Done after rebuild so we don't surface stale errors.
    const allFilesSet = new Set(allFiles);
    for (const cached of diagnosticCache.keys()) {
      if (!allFilesSet.has(cached)) diagnosticCache.delete(cached);
    }

    if (!targetFiles) {
      diagnosticCache.clear();
      unscopedDiagnostics = [];
    } else {
      for (const file of filesToCheck) diagnosticCache.delete(file);
    }

    for (const fileName of filesToCheck) {
      const sf = tsProgram.getSourceFile(fileName);
      if (!sf || sf.isDeclarationFile) continue;

      const fileDiags: ts.Diagnostic[] = [
        ...compiler.getDiagnosticsForFile(sf, optimizeFor),
        ...tsProgram.getSemanticDiagnostics(sf),
      ];

      const serialized = fileDiags
        .filter(
          (d) =>
            d.category === ts.DiagnosticCategory.Error ||
            d.category === ts.DiagnosticCategory.Warning,
        )
        .map(serializeDiagnostic);

      if (serialized.length > 0) {
        diagnosticCache.set(fileName, serialized);
      }
    }

    const allDiagnostics: SerializedDiagnostic[] = [...unscopedDiagnostics];
    for (const list of diagnosticCache.values()) {
      allDiagnostics.push(...list);
    }

    parentPort?.postMessage({
      type: 'diagnostics',
      diagnostics: allDiagnostics,
    });
  } catch (e: any) {
    parentPort?.postMessage({
      type: 'error',
      message: `Type check failed: ${e.message}`,
    });
  }
}

/**
 * Schedule a debounced check. Multiple rapid file changes (e.g. HMR bursts)
 * are coalesced into a single rebuild after DEBOUNCE_MS of quiet. File lists
 * from coalesced messages are unioned; an unscoped check (no files) collapses
 * the queue to a whole-program check.
 */
function scheduleCheck(files?: string[]) {
  if (files === undefined) {
    pendingFiles = null;
  } else if (pendingFiles !== null) {
    for (const f of files) pendingFiles.add(f);
  } else if (debounceTimer === null && !checking) {
    pendingFiles = new Set(files);
  } else {
    pendingFiles = pendingFiles ?? new Set<string>();
    for (const f of files) pendingFiles.add(f);
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    if (checking) {
      dirty = true;
      return;
    }
    checking = true;
    const target = pendingFiles;
    pendingFiles = null;
    try {
      await check(target);
    } finally {
      checking = false;
      if (dirty) {
        dirty = false;
        scheduleCheck();
      }
    }
  }, DEBOUNCE_MS);
}

function serializeDiagnostic(d: ts.Diagnostic): SerializedDiagnostic {
  let file: string | undefined;
  let line: number | undefined;
  let column: number | undefined;

  if (d.file && d.start !== undefined) {
    file = d.file.fileName;
    const pos = d.file.getLineAndCharacterOfPosition(d.start);
    line = pos.line + 1;
    column = pos.character + 1;
  }

  return {
    file,
    line,
    column,
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    category:
      d.category === ts.DiagnosticCategory.Error
        ? 'error'
        : d.category === ts.DiagnosticCategory.Warning
          ? 'warning'
          : 'suggestion',
    code: d.code,
  };
}

parentPort?.on('message', async (msg: WorkerMessage) => {
  switch (msg.type) {
    case 'init':
      try {
        await init(msg.tsconfig);
      } catch (e: any) {
        parentPort?.postMessage({
          type: 'error',
          message: `Init failed: ${e.message}`,
        });
      }
      break;

    case 'check':
      scheduleCheck(msg.files);
      break;

    case 'shutdown':
      if (debounceTimer) clearTimeout(debounceTimer);
      process.exit(0);
      break;
  }
});
