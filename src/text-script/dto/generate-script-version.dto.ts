import { IsEnum } from 'class-validator';
import { ChScript } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateScriptVersionDto {
  @ApiProperty({ enum: ChScript })
  @IsEnum(ChScript)
  script: ChScript;
}
