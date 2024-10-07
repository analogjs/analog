export const INVALID_METADATA_PROPERTIES = [
  'template',
  'standalone',
  'changeDetection',
  'styles',
  'outputs',
  'inputs',
];

export const SCRIPT_TAG_REGEX = /<script lang="ts">([\s\S]*?)<\/script>/i;
export const TEMPLATE_TAG_REGEX =
  /(<template(?:\s+([^>]*?))?>)([\s\S]*?)<\/template>/i;
export const STYLE_TAG_REGEX = /<style>([\s\S]*?)<\/style>/i;
export const FRONTMATTER_REGEX = /^\s*---[\s\S]*?---/;

export const ON_INIT = 'onInit';
export const ON_DESTROY = 'onDestroy';
export const DEFINE_METADATA = 'defineMetadata';
export const ROUTE_META = 'routeMeta';
export const INPUT = 'input';
export const OUTPUT = 'output';
export const OUTPUT_FROM_OBSERVABLE = 'outputFromObservable';
export const MODEL = 'model';
export const INPUT_REQUIRED = 'input.required';
export const VIEW_CHILD = 'viewChild';
export const VIEW_CHILD_REQUIRED = 'viewChild.required';
export const VIEW_CHILDREN = 'viewChildren';
export const CONTENT_CHILD = 'contentChild';
export const CONTENT_CHILD_REQUIRED = 'contentChild.required';
export const CONTENT_CHILDREN = 'contentChildren';

export const HOOKS_MAP = {
  [ON_INIT]: 'ngOnInit',
  [ON_DESTROY]: 'ngOnDestroy',
} as const;

export const SIGNALS_MAP: Record<string, string> = {
  [INPUT]: 'input',
  [OUTPUT]: 'output',
  [OUTPUT_FROM_OBSERVABLE]: 'outputFromObservable',
  [MODEL]: 'model',
  [VIEW_CHILD]: 'viewChild',
  [VIEW_CHILDREN]: 'viewChildren',
  [CONTENT_CHILD]: 'contentChild',
  [CONTENT_CHILDREN]: 'contentChildren',
};

export const REQUIRED_SIGNALS_MAP: Record<string, string> = {
  [INPUT_REQUIRED]: 'input.required',
  [VIEW_CHILD_REQUIRED]: 'viewChild.required',
  [CONTENT_CHILD_REQUIRED]: 'contentChild.required',
};
