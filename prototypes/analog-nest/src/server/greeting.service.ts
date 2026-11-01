import { Injectable } from '@nestjs/common';

import { ClockService } from './clock.service';

@Injectable()
export class GreetingService {
  readonly instance = Math.random().toString(36).slice(2, 8);

  // Implicit constructor injection: only works if decorator metadata is emitted.
  constructor(private readonly clock: ClockService) {}

  greet(name: string) {
    return {
      message: `Hello ${name}, from NestJS at ${this.clock.now()}`,
      instance: this.instance,
    };
  }
}
