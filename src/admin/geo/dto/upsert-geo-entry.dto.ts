import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { GeoSettlementType } from "@prisma/client";

export class GeoNameDto {
  @ApiProperty({ description: "Chechen name" })
  @IsString()
  @MaxLength(200)
  che: string;

  @ApiProperty({ description: "Russian name" })
  @IsString()
  @MaxLength(200)
  ru: string;

  @ApiProperty({ description: "English name" })
  @IsString()
  @MaxLength(200)
  en: string;
}

// ── Country ───────────────────────────────────────────────────────────────────

export class CreateCountryDto {
  @ApiProperty({ description: "ISO 3166-1 alpha-2 code, e.g. RU, GE" })
  @IsString()
  @MaxLength(10)
  code: string;

  @ApiProperty({ type: GeoNameDto })
  @ValidateNested()
  @Type(() => GeoNameDto)
  name: GeoNameDto;
}

export class UpdateCountryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  @ApiPropertyOptional({ type: GeoNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoNameDto)
  name?: GeoNameDto;
}

// ── Region ────────────────────────────────────────────────────────────────────

export class CreateRegionDto {
  @ApiProperty()
  @IsString()
  countryId: string;

  @ApiProperty({ type: GeoNameDto })
  @ValidateNested()
  @Type(() => GeoNameDto)
  name: GeoNameDto;
}

export class UpdateRegionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional({ type: GeoNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoNameDto)
  name?: GeoNameDto;
}

// ── District ──────────────────────────────────────────────────────────────────

export class CreateDistrictDto {
  @ApiProperty()
  @IsString()
  regionId: string;

  @ApiProperty({ type: GeoNameDto })
  @ValidateNested()
  @Type(() => GeoNameDto)
  name: GeoNameDto;
}

export class UpdateDistrictDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ type: GeoNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoNameDto)
  name?: GeoNameDto;
}

// ── Settlement ────────────────────────────────────────────────────────────────

export class CreateSettlementDto {
  @ApiProperty()
  @IsString()
  districtId: string;

  @ApiProperty({ type: GeoNameDto })
  @ValidateNested()
  @Type(() => GeoNameDto)
  name: GeoNameDto;

  @ApiProperty({ enum: GeoSettlementType })
  @IsEnum(GeoSettlementType)
  type: GeoSettlementType;
}

export class UpdateSettlementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  districtId?: string;

  @ApiPropertyOptional({ type: GeoNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoNameDto)
  name?: GeoNameDto;

  @ApiPropertyOptional({ enum: GeoSettlementType })
  @IsOptional()
  @IsEnum(GeoSettlementType)
  type?: GeoSettlementType;
}
