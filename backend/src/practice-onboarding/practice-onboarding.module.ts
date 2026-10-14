import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { MailModule } from '../mail/mail.module';
import { MealPlansModule } from '../meal-plans/meal-plans.module';
import { VerificationModule } from '../verification/verification.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AdminPracticeOnboardingController, PublicPracticeOnboardingController } from './practice-onboarding.controller';
import { PracticeOnboardingService } from './practice-onboarding.service';

@Module({
  imports: [AuthModule, ClientsModule, MailModule, MealPlansModule, VerificationModule, WorkspacesModule],
  controllers: [AdminPracticeOnboardingController, PublicPracticeOnboardingController],
  providers: [PracticeOnboardingService],
  exports: [PracticeOnboardingService],
})
export class PracticeOnboardingModule {}
