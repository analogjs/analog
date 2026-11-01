import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';

import { GreetingService } from './greeting.service';

@Controller('api/hello')
export class HelloController {
  constructor(private readonly greeting: GreetingService) {}

  @Get(':name')
  get(@Param('name') name: string) {
    if (name === 'missing') {
      throw new NotFoundException('No such greeting');
    }
    return this.greeting.greet(name);
  }

  @Post()
  post(@Body() body: { name: string }) {
    return this.greeting.greet(body.name);
  }
}
