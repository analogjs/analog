export interface AnalogNxApplicationGeneratorOptions {
  analogAppName: string;
  tags?: string;
  addTailwind?: boolean;
  skipFormat?: boolean;
  // Set by the preset, which seeds agent context at the workspace root instead.
  skipAgentContext?: boolean;
}
