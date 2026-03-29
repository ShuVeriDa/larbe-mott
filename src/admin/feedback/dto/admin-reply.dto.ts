import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AdminReplyDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean = false;
}
