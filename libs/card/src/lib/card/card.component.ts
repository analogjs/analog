import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'lib-card',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.css'],
})
export class CardComponent {
  title = 'card-works';
  render = false;
}
