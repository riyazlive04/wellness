import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { WorkspaceRecipesModule } from '../workspace-recipes/workspace-recipes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientsService } from './clients.service';
import { JoinController } from './join.controller';
import { MeController } from './me.controller';
import { PushModule } from './push.module';
import { WorkspaceClientsController } from './workspace-clients.controller';
import { WorkspaceAppointmentsController } from './workspace-appointments.controller';
import { AssessmentFormsController } from './assessment-forms.controller';
import { BookingHoursService } from './booking-hours.service';
import { ClientPreviewService } from './client-preview.service';
import { MealSlotsService } from '../meal-plans/meal-slots.service';

@Module({
  imports: [AuthModule, TenancyModule, WorkspaceRecipesModule, PushModule, NotificationsModule],
  controllers: [WorkspaceClientsController, WorkspaceAppointmentsController, AssessmentFormsController, MeController, JoinController],
  providers: [ClientsService, BookingHoursService, ClientPreviewService, MealSlotsService],
  // Re-export PushModule so existing importers of ClientsModule keep getting PushService.
  exports: [ClientsService, PushModule],
})
export class ClientsModule {}