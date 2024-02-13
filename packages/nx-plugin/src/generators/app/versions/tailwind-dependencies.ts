import {
  V18_X_AUTOPREFIXER,
  V18_X_POSTCSS,
  V18_X_TAILWINDCSS,
} from './nx_18_X/versions';

const tailwindDependencyKeys = [
  'autoprefixer',
  'postcss',
  'tailwindcss',
] as const;

export type TailwindDependency = (typeof tailwindDependencyKeys)[number];

export const getTailwindDependencies = (): Record<
  TailwindDependency,
  string
> => {
  return {
    autoprefixer: V18_X_AUTOPREFIXER,
    postcss: V18_X_POSTCSS,
    tailwindcss: V18_X_TAILWINDCSS,
  };
};
