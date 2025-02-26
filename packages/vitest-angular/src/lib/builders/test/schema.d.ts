export interface VitestSchema {
  mode?: string;
  configFile?: string;
  reportsDirectory?: string;
  testFiles?: string[];
  watch?: boolean;
  ui?: boolean;
  coverage?: boolean;
  update?: boolean;
}
