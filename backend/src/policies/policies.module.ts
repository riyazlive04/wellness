import { Module } from '@nestjs/common';
import { AdminPoliciesController } from './admin-policies.controller';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';

@Module({
  controllers: [PoliciesController, AdminPoliciesController],
  providers: [PoliciesService],
})
export class PoliciesModule {}
