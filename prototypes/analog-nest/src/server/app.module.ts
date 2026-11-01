import { Module } from '@nestjs/common';

import { AnalogModule } from '../analog-nest/analog.module';
import { ClockService } from './clock.service';
import { GreetingService } from './greeting.service';
import { HelloController } from './hello.controller';

@Module({
  imports: [AnalogModule],
  controllers: [HelloController],
  providers: [ClockService, GreetingService],
})
export class AppModule {}
