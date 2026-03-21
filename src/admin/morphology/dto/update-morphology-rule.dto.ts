import { ApiPropertyOptional } from "@nestjs/swagger";
import { MorphRuleType } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export class UpdateMorphologyRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  suffix?: string;

  @ApiPropertyOptional({ enum: MorphRuleType })
  @IsOptional()
  @IsEnum(MorphRuleType)
  type?: MorphRuleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
