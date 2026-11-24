import type ts from 'typescript';

export interface HmrUpdateResult {
  hmrUpdateCode?: string | null;
}

export interface EmitFileResult {
  content?: string;
  map?: string;
  dependencies: readonly string[];
  hash?: Uint8Array;
  errors?: (string | ts.DiagnosticMessageChain)[];
  warnings?: (string | ts.DiagnosticMessageChain)[];
  hmrUpdateCodes?: Map<string, string>;
  hmrEligible?: boolean | null;
}
