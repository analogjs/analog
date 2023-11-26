export interface TestSchema {
  include: string[];
  exclude: string[];
  setupFile: string;
  tsConfig: string;
  watch: boolean;
} // eslint-disable-line
