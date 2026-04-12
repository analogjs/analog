import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { AutocompleteComponent } from './autocomplete.component';

describe('GIVEN AutocompleteComponent', () => {
  let fixture: ComponentFixture<AutocompleteComponent>;
  let component: AutocompleteComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations()],
      imports: [AutocompleteComponent],
    });

    fixture = TestBed.createComponent(AutocompleteComponent);
    component = fixture.componentInstance;
  });

  const getInput = () =>
    fixture.nativeElement.querySelector('input') as HTMLInputElement;

  describe('WHEN input value is empty', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('value', '');
      fixture.detectChanges();
    });

    it('THEN component should be initialized', () => {
      expect(component).toBeTruthy();
    });

    it('THEN component should match snapshot', () => {
      expect(fixture.nativeElement).toMatchSnapshot();
    });

    describe('AND input is focused', () => {
      beforeEach(async () => {
        const input = getInput();

        input.focus();
        input.dispatchEvent(new Event('focus'));
        fixture.detectChanges();
        await fixture.whenStable();
      });

      it('THEN component should match snapshot', () => {
        expect(fixture.nativeElement).toMatchSnapshot();
      });

      it('THEN autocomplete should be opened', async () => {
        const actual = getInput().getAttribute('aria-expanded');

        expect(actual).toBe('true');
      });

      it('THEN autocomplete should have 3 options', async () => {
        const actual = document.body.querySelectorAll('mat-option').length;

        expect(actual).toBe(3);
      });
    });
  });

  describe('WHEN input value is not empty', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('value', 'est');
      fixture.detectChanges();
    });

    it('THEN component should be initialized', () => {
      expect(component).toBeTruthy();
    });

    it('THEN component should match snapshot', () => {
      expect(fixture.nativeElement).toMatchSnapshot();
    });

    describe('AND input is focused', () => {
      beforeEach(async () => {
        const input = getInput();

        input.focus();
        input.dispatchEvent(new Event('focus'));
        fixture.detectChanges();
        await fixture.whenStable();
      });

      it('THEN component should match snapshot', () => {
        expect(fixture.nativeElement).toMatchSnapshot();
      });

      it('THEN autocomplete should be opened', async () => {
        const actual = getInput().getAttribute('aria-expanded');

        expect(actual).toBe('true');
      });

      it('THEN autocomplete should have 2 options', async () => {
        const actual = document.body.querySelectorAll('mat-option').length;

        expect(actual).toBe(2);
      });
    });
  });
});
