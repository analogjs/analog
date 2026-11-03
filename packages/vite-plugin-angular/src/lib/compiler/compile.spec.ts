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
    // Outputs map is `{ classPropertyName: bindingName }`. For a model
    // signal the class property is `count` and the binding name is
    // `countChange` (Angular inverts this map at runtime to look up
    // `instance.count`, which is the subscribable model signal).
    expect(result).toContain('count: "countChange"');
  });

  it('compiles pipes and injectables', () => {
    const pipe = compile(`@Pipe({ name: 'trim' }) class T {}`, 't.ts');
    const service = compile(`@Injectable() class S {}`, 's.ts');
    expect(pipe).toContain('ɵpipe');
    expect(service).toContain('ɵprov');
  });

  it('uses null for the default providedIn for Injectable', () => {
    const service = compile(`@Injectable() class S {}`, 's.ts');
    expect(service).not.toContain('providedIn: "root"');
    expect(service).not.toContain("providedIn: 'root'");
  });

  it('compiles decorated classes nested in function scopes', () => {
    const result = compile(
      `export function setup() {
        @NgModule({ providers: [] })
        class TestModule {}
        @Component({ selector: 'x-nested', template: '<p>{{ v }}</p>' })
        class Nested { v = input(0); }
        return [TestModule, Nested];
      }`,
      'setup.ts',
    );
    expect(result).toContain('static ɵmod');
    expect(result).toContain('static ɵcmp');
    expect(result).not.toContain('@NgModule');
    // setClassMetadata references the class, so it must stay inside setup().
    const scopeEnd = result.indexOf('return [TestModule, Nested]');
    for (const cls of ['TestModule', 'Nested']) {
      const idx = result.indexOf(`ɵsetClassMetadata(${cls},`);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeLessThan(scopeEnd);
    }
  });

  it('keeps constructor DI token imports for nested decorated classes', () => {
    const result = compile(
      `import { Logger } from './logger';
      export function setup() {
        @Injectable()
        class Svc { constructor(private logger: Logger) {} }
        return Svc;
      }`,
      'setup.ts',
    );
    expect(result).toContain("import { Logger } from './logger'");
    expect(result).toContain('ɵɵinject(Logger)');
    expect(result).not.toContain('ɵɵinvalidFactory');
  });
});
