import {
  ChangeDetectionStrategy,
  Component,
  computed,
  model,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';

@Component({
  standalone: true,
  selector: 'app-autocomplete',
  templateUrl: './autocomplete.component.html',
  styleUrl: './autocomplete.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatInputModule,
  ],
})
export class AutocompleteComponent {
  public readonly value = model.required<string>();

  protected readonly options = Object.freeze([
    {
      label: 'Jest',
      value: TestRunner.Jest,
    },
    {
      label: 'Karma',
      value: TestRunner.Karma,
    },
    {
      label: 'Vitest',
      value: TestRunner.Vitest,
    },
  ]);

  protected readonly filteredOptions = computed(() => {
    const value = this.value().toLocaleLowerCase().trim();

    return Object.freeze(
      this.options.filter((option) =>
        option.label.toLocaleLowerCase().includes(value),
      ),
    );
  });
}

export const enum TestRunner {
  Jest,
  Karma,
  Vitest,
}
