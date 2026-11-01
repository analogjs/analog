import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost, ModuleRef } from '@nestjs/core';

import { createAnalogHandler } from '../router-server/analog-handler';
import { ClockService } from './clock.service';
import { GreetingService } from './greeting.service';
import { HelloController } from './hello.controller';
import { setNestApp } from './inject-nest';

@Module({
  controllers: [HelloController],
  providers: [ClockService, GreetingService],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    moduleRef: ModuleRef,
  ) {
    setNestApp(moduleRef);
  }

  // Runs after Nest registers controller routes and before its 404 handler,
  // so Analog only sees requests no controller claimed.
  onModuleInit(): void {
    this.adapterHost.httpAdapter.use(createAnalogHandler());
  }
}
