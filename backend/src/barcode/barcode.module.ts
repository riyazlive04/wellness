import { Module } from '@nestjs/common';
import { BarcodeService } from './barcode.service';
import { BarcodeController } from './barcode.controller';

/** Barcode scanning for fast packaged-food logging (Open Food Facts + curated cache). */
@Module({
  controllers: [BarcodeController],
  providers: [BarcodeService],
})
export class BarcodeModule {}
