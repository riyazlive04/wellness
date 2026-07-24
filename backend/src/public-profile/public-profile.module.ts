import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { VerificationModule } from '../verification/verification.module';
import { PublicProfileController } from './public-profile.controller';
import { PublicProfileService } from './public-profile.service';

@Module({
  imports: [ClientsModule, VerificationModule],
  controllers: [PublicProfileController],
  providers: [PublicProfileService],
  exports: [PublicProfileService],
})
export class PublicProfileModule {}
