import type ts from 'typescript';

export interface EmitFileResult {
  content?: string;
  map?: string;
  dependencies: readonly string[];
  hash?: Uint8Array;
  errors?: (string | ts.DiagnosticMessageChain)[];
  warnings?: (string | ts.DiagnosticMessageChain)[];
  hmrUpdateCode?: string | null;
  hmrEligible?: boolean | null;
}
