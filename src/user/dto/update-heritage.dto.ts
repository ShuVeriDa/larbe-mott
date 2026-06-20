import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum HeritageNationType {
  NAKHCHIY = "nakhchiy",
  OTHER = "other",
}

export class UpdateHeritageDto {
  @ApiPropertyOptional({ description: "Nation ID from the directory" })
  @IsOptional()
  @IsUUID()
  nationId?: string;

  // Chechen path

  @ApiPropertyOptional({ description: "Tukhum ID from the directory" })
  @IsOptional()
  @IsUUID()
  tukhumId?: string;

  @ApiPropertyOptional({ description: "Explicit 'no tukhum' flag (false = chosen 'no tukhum')" })
  @IsOptional()
  @IsBoolean()
  hasTukhum?: boolean;

  @ApiPropertyOptional({ description: "Taip ID from the directory" })
  @IsOptional()
  @IsUUID()
  taipId?: string;

  @ApiPropertyOptional({ description: "Custom taip name (pending moderation)", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().replace(/<[^>]*>/g, "") : value,
  )
  taipCustom?: string;

  @ApiPropertyOptional({ description: "Gara ID from the directory" })
  @IsOptional()
  @IsUUID()
  garaId?: string;

  @ApiPropertyOptional({ description: "Custom gara name (pending moderation)", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().replace(/<[^>]*>/g, "") : value,
  )
  garaCustom?: string;

  @ApiPropertyOptional({ description: "Nekyi (free text, no moderation)", maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().replace(/<[^>]*>/g, "") : value,
  )
  nekyi?: string;

  // Other nation

  @ApiPropertyOptional({ description: "Other nation name (when not Nakhchiy)", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().replace(/<[^>]*>/g, "") : value,
  )
  otherNationName?: string;

  // Location

  @ApiPropertyOptional({ description: "Region ID from the geo directory" })
  @IsOptional()
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional({ description: "District ID from the geo directory" })
  @IsOptional()
  @IsUUID()
  districtId?: string;

  @ApiPropertyOptional({ description: "Settlement ID from the geo directory" })
  @IsOptional()
  @IsUUID()
  settlementId?: string;
}
