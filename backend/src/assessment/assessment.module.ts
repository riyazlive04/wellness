import { Module } from '@nestjs/common';
import { AnthropometryCalculator } from './anthropometry.calculator';
import { AssessmentService } from './assessment.service';
import { ClientAssessmentController, MyAssessmentController } from './assessment.controller';

/** Client anthropometry — BMI/IBW/BMR/TDEE/WHR/body-fat + measurement tracking. */
@Module({
  controllers: [MyAssessmentController, ClientAssessmentController],
  providers: [AssessmentService, AnthropometryCalculator],
  exports: [AssessmentService],
})
export class AssessmentModule {}
