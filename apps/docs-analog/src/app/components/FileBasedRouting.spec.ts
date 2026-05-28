import { TestBed } from '@angular/core/testing';
import { FileBasedRouting } from './FileBasedRouting';

describe('FileBasedRouting', () => {
  it('renders the file list and the generated routes alongside it', () => {
    const fixture = TestBed.createComponent(FileBasedRouting);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent ?? '';

    // Both columns reference the catch-all docs route.
    expect(text).toContain('docs/[[...slug]].page.ts');
    expect(text).toContain('/docs/*');
    // The catch-all is the highlighted row (brand color), the others
    // render as plain entries.
    expect(text).toContain('(home).page.ts');
    expect(text).toContain('/about');
  });
});
