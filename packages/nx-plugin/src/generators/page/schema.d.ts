export interface AnalogPageGeneratorSchema {
  name: string;
  project: string;
  metadata?: boolean;
  title?: string;
  redirectPage?: boolean;
  redirectPath?: string;
  pathMatch?: string;
}

export interface NormalizedSchema extends AnalogPageGeneratorSchema {
  projectRoot: string;
}
