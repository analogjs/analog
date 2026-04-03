import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';

describe('NgLite Compiler', () => {
  // it('defaults to standalone and OnPush', () => {
  //   const result = compile(`@Component({ selector: 'app-x', template: '' }) class X {}`, 'x.ts');
  //   // expect(result).toContain('standalone: true');
  //   expect(result).toContain(': 2');
  // });

  it('detects model signals', () => {
    const result = compile(
      `@Component({ selector: 'x', template: '' }) class X { count = model(0); }`,
      'x.ts',
    );
    // Signal model inputs use array descriptor format: [flags, publicName, className, transform]
    expect(result).toContain('count: [');
    expect(result).toContain('countChange: "countChange"');
  });

  it('compiles pipes and injectables', () => {
    const pipe = compile(`@Pipe({ name: 'trim' }) class T {}`, 't.ts');
    const service = compile(`@Injectable() class S {}`, 's.ts');
    expect(pipe).toContain('ɵpipe');
    expect(service).toContain('ɵprov');
  });
});
