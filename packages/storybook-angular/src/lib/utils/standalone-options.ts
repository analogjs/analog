import {
  BuilderOptions,
  CLIOptions,
  LoadOptions,
} from 'storybook/internal/types';

export type StandaloneOptions = CLIOptions &
  LoadOptions &
  BuilderOptions & {
    mode?: 'static' | 'dev';
    enableProdMode: boolean;
    angularBuilderOptions?: Record<string, any> & {
      experimentalZoneless?: boolean;
    };
    tsConfig?: string;
  };
