import { Module } from '@nestjs/common';
import { AdminHealthController } from './admin-health.controller';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, AdminHealthController],
})
export class HealthModule {}