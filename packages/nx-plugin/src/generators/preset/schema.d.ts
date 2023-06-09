export interface PresetGeneratorSchema {
  analogAppName: string;
  tags?: string;
  addTailwind?: boolean;
  addTRPC?: boolean;
  skipFormat?: boolean;
}
