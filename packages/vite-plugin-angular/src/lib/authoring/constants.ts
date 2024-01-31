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

export const ON_INIT = 'onInit';
export const ON_DESTROY = 'onDestroy';

export const HOOKS_MAP = {
  [ON_INIT]: 'ngOnInit',
  [ON_DESTROY]: 'ngOnDestroy',
} as const;
