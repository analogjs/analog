export interface VitestSchema {
  mode?: string;
  setupFile: string;
  configFile?: string;
  include: string[];
  exclude?: string[];
  watch?: boolean;
  tsConfig: string;
}
