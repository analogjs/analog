export interface PresetGeneratorSchema {
  name: string;
  tags?: string;
  addTailwind?: boolean;
  addTRPC?: boolean;
  skipFormat?: boolean;
}
