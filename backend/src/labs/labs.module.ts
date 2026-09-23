import { Module } from '@nestjs/common';
import { LabsService } from './labs.service';
import { LabsController, LabMarkersController, MyLabsController } from './labs.controller';

/**
 * Structured lab results — the typed destination for the values the
 * `lab_results` assessment form already collects as free text.
 */
@Module({
  controllers: [LabsController, LabMarkersController, MyLabsController],
  providers: [LabsService],
  exports: [LabsService],
})
export class LabsModule {}
