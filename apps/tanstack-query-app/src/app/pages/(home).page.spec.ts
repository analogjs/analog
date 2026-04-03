import '../testing/init-test-env';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import HomePageComponent from './(home).page';

describe('HomePageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePageComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(HomePageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the page heading', () => {
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'TanStack Query + Analog',
    );
  });

  it('should render all four demo cards', () => {
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const cardTitles = Array.from(compiled.querySelectorAll('.card-title')).map(
      (el) => el.textContent?.trim(),
    );

    expect(cardTitles).toContain('Basic Query & Mutation');
    expect(cardTitles).toContain('Multi & Dependent Queries');
    expect(cardTitles).toContain('Infinite Query');
    expect(cardTitles).toContain('Optimistic Updates');
  });
});
