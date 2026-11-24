import { Controller, Get } from '@nestjs/common';

import { HelloService } from './hello.service';

@Controller('api/v1/hello')
export class HelloController {
  constructor(private readonly hello: HelloService) {}

  @Get()
  get() {
    return this.hello.greet();
  }
}
