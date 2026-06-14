import { IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateScriptPageDto {
  @ApiProperty({ description: 'TipTap JSON document' })
  @IsObject()
  @IsNotEmpty()
  contentRich: Record<string, unknown>;
}
