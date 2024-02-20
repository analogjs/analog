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
  /(<template>|<template lang="md">)([\s\S]*?)<\/template>/i;
export const STYLE_TAG_REGEX = /<style>([\s\S]*?)<\/style>/i;
export const IMPORT_TAG_REGEX = /<imports>([\s\S]*?)<\/imports>/i;
export const IMPORT_STATEMENT_REGEX =
  /import\s+({.*?})?\s*([\w\d]+)?\s+from\s+['"](.+?)['"]\s*;?/g;

export const ON_INIT = 'onInit';
export const ON_DESTROY = 'onDestroy';
export const INPUT = 'input';
export const INPUT_REQUIRED = 'input.required';
export const VIEWCHILD = 'viewChild';
export const VIEWCHILD_REQUIRED = 'viewChild.required';
export const VIEWCHILDREN = 'viewChildren';
export const CONTENT_CHILD = 'contentChild';
export const CONTENT_CHILD_REQUIRED = 'contentChild.required';
export const CONTENTCHILDREN = 'contentChildren';

export const HOOKS_MAP = {
  [ON_INIT]: 'ngOnInit',
  [ON_DESTROY]: 'ngOnDestroy',
} as const;

export const SIGNALS_MAP: Record<string, string> = {
  [INPUT]: 'input',
  [VIEWCHILD]: 'viewChild',
  [VIEWCHILDREN]: 'viewChildren',
  [CONTENT_CHILD]: 'contentChild',
  [CONTENTCHILDREN]: 'contentChildren',
};

export const REQUIRED_SIGNALS_MAP: Record<string, string> = {
  [INPUT_REQUIRED]: 'input.required',
  [VIEWCHILD_REQUIRED]: 'viewChild.required',
  [CONTENT_CHILD_REQUIRED]: 'contentChild.required',
};
