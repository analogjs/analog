import {
  POSTCSS,
  TAILWINDCSS,
  TAILWINDCSS_POSTCSS,
  TAILWINDCSS_VITE,
} from './versions';

const tailwindDependencyKeys = [
  'postcss',
  'tailwindcss',
  '@tailwindcss/postcss',
  '@tailwindcss/vite',
] as const;

export type TailwindDependency = (typeof tailwindDependencyKeys)[number];

export const getTailwindDependencies = (): Record<
  TailwindDependency,
  string
> => {
  return {
    postcss: POSTCSS,
    tailwindcss: TAILWINDCSS,
    '@tailwindcss/postcss': TAILWINDCSS_POSTCSS,
    '@tailwindcss/vite': TAILWINDCSS_VITE,
  };
};
