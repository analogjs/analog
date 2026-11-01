import { Injectable } from '@nestjs/common';

@Injectable()
export class ClockService {
  now() {
    return new Date().toISOString();
  }
}
