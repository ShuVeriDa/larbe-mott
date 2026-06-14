import { Module } from '@nestjs/common';
import { TransliterationService } from './transliteration.service';

@Module({
  providers: [TransliterationService],
  exports: [TransliterationService],
})
export class TransliterationModule {}
