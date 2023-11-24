export interface TestSchema {
  include: string[];
  exclude: string;
  setupFile: string;
  tsConfig: string;
  watch: boolean;
  globals: boolean;
  environment: string;
} // eslint-disable-line
