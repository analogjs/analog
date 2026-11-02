import { Injectable } from '@nestjs/common';

@Injectable()
export class HelloService {
  greet() {
    return { message: 'Hello World' };
  }
}
