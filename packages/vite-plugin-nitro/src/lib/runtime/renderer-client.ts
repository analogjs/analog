/* eslint-disable @nx/enforce-module-boundaries */

import { eventHandler } from 'h3';

import template from '#analog/index';

export default eventHandler(async () => {
  return template;
});
