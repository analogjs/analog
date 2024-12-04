import { ComponentFixture, TestBed } from '@angular/core/testing';
import { type HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { AutocompleteComponent } from './autocomplete.component';

describe('GIVEN AutocompleteComponent', () => {
  let fixture: ComponentFixture<AutocompleteComponent>;
  let harnessLoader: HarnessLoader;
  let component: AutocompleteComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations()],
      imports: [AutocompleteComponent],
    });

    fixture = TestBed.createComponent(AutocompleteComponent);
    harnessLoader = TestbedHarnessEnvironment.loader(fixture);
    component = fixture.componentInstance;
  });

  describe('WHEN input value is empty', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('value', '');
      fixture.detectChanges();
    });

    it('THEN component should be initialized', () => {
      expect(component).toBeTruthy();
    });

    it('THEN component should match snapshot', () => {
      expect(fixture.debugElement.nativeElement).toMatchSnapshot();
    });

    describe('AND input is focused', () => {
      let autocomplete: MatAutocompleteHarness;

      beforeEach(async () => {
        autocomplete = await harnessLoader.getHarness(MatAutocompleteHarness);

        await autocomplete.focus();
      });

      it('THEN component should match snapshot', () => {
        expect(fixture.debugElement.nativeElement).toMatchSnapshot();
      });

      it('THEN autocomplete should be opened', async () => {
        const actual = await autocomplete.isOpen();

        expect(actual).toBe(true);
      });

      it('THEN autocomplete should have 3 options', async () => {
        const options = await autocomplete.getOptions();
        const actual = options.length;

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
      expect(fixture.debugElement.nativeElement).toMatchSnapshot();
    });

    describe('AND input is focused', () => {
      let autocomplete: MatAutocompleteHarness;

      beforeEach(async () => {
        autocomplete = await harnessLoader.getHarness(MatAutocompleteHarness);

        await autocomplete.focus();
      });

      it('THEN component should match snapshot', () => {
        expect(fixture.debugElement.nativeElement).toMatchSnapshot();
      });

      it('THEN autocomplete should be opened', async () => {
        const actual = await autocomplete.isOpen();

        expect(actual).toBe(true);
      });

      it('THEN autocomplete should have 2 options', async () => {
        const options = await autocomplete.getOptions();
        const actual = options.length;

        expect(actual).toBe(2);
      });
    });
  });
});
