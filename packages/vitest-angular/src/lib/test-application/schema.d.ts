export interface VitestSchema {
  mode?: string;
  setupFile?: string;
  configFile?: string;
  reportsDirectory?: string;
  include?: string[];
  watch?: boolean;
  tsConfig: string;
}
