import {
  V18_X_POSTCSS,
  V18_X_TAILWINDCSS,
  V18_X_TAILWINDCSS_VITE,
} from './nx_18_X/versions';

const tailwindDependencyKeys = [
  'postcss',
  'tailwindcss',
  '@tailwindcss/vite',
] as const;

export type TailwindDependency = (typeof tailwindDependencyKeys)[number];

export const getTailwindDependencies = (): Record<
  TailwindDependency,
  string
> => {
  return {
    postcss: V18_X_POSTCSS,
    tailwindcss: V18_X_TAILWINDCSS,
    '@tailwindcss/vite': V18_X_TAILWINDCSS_VITE,
  };
};
