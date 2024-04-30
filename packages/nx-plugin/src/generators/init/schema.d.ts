export interface SetupAnalogGeneratorSchema {
  project: string;
  vitest: boolean;
}

export interface NormalizedSchema extends SetupAnalogGeneratorSchema {
  projectRoot: string;
}
