import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DataPrivacyController } from './data-privacy.controller';
import { DataPrivacyService } from './data-privacy.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [DataPrivacyController],
  providers: [DataPrivacyService],
})
export class DataPrivacyModule {}
