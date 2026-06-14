import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaService } from 'src/prisma.service';
import { TransliterationModule } from 'src/transliteration/transliteration.module';
import { TextScriptController } from './text-script.controller';
import { TextScriptService } from './text-script.service';

@Module({
  imports: [AuthModule, TransliterationModule],
  controllers: [TextScriptController],
  providers: [TextScriptService, PrismaService],
  exports: [TextScriptService],
})
export class TextScriptModule {}
