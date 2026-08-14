import * as content from './index';
import * as devtools from '../devtools/src/index';

describe('@analogjs/content public entrypoints', () => {
  it('does not expose devtools exports from the main entrypoint', () => {
    expect(content).not.toHaveProperty('contentDevToolsPlugin');
    expect(content).not.toHaveProperty('DevToolsContentRenderer');
    expect(content).not.toHaveProperty('withContentDevTools');
  });

  it('exposes devtools exports from the dedicated devtools entrypoint', () => {
    expect(devtools.contentDevToolsPlugin).toBeTypeOf('function');
    expect(devtools.DevToolsContentRenderer).toBeDefined();
    expect(devtools.withContentDevTools).toBeTypeOf('function');
  });
});
