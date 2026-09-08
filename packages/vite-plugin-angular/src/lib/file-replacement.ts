export type FileReplacement = FileReplacementWith | FileReplacementSSR;

export interface FileReplacementBase {
  replace: string;
}
export interface FileReplacementWith extends FileReplacementBase {
  with: string;
}

export interface FileReplacementSSR extends FileReplacementBase {
  ssr: string;
}
