export interface PresetGeneratorSchema {
  analogAppName: string;
  tags?: string;
  addTailwind?: boolean;
  linter?: 'eslint' | 'oxlint' | 'none';
  skipFormat?: boolean;
}
