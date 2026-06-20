import { IsBoolean, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdatePrivacyDto {
  @ApiPropertyOptional({ description: "Show phone number in public profile" })
  @IsOptional()
  @IsBoolean()
  showPhone?: boolean;

  @ApiPropertyOptional({ description: "Show age in public profile" })
  @IsOptional()
  @IsBoolean()
  showAge?: boolean;

  @ApiPropertyOptional({ description: "Show heritage (taip, tukhum, etc.) in public profile" })
  @IsOptional()
  @IsBoolean()
  showHeritage?: boolean;

  @ApiPropertyOptional({ description: "Show location (region/settlement) in public profile" })
  @IsOptional()
  @IsBoolean()
  showLocation?: boolean;

  @ApiPropertyOptional({ description: "Show activity stats in public profile" })
  @IsOptional()
  @IsBoolean()
  showActivity?: boolean;

  @ApiPropertyOptional({ description: "Show join date in public profile" })
  @IsOptional()
  @IsBoolean()
  showJoinDate?: boolean;
}
