import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class MultilingualNameDto {
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

export class CreateNationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  slug: string;

  @ApiProperty({ type: MultilingualNameDto })
  @ValidateNested()
  @Type(() => MultilingualNameDto)
  name: MultilingualNameDto;
}

export class UpdateNationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ type: MultilingualNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MultilingualNameDto)
  name?: MultilingualNameDto;
}

export class CreateTukhumDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  slug: string;

  @ApiProperty({ type: MultilingualNameDto })
  @ValidateNested()
  @Type(() => MultilingualNameDto)
  name: MultilingualNameDto;

  @ApiProperty({ description: "nationId" })
  @IsString()
  nationId: string;
}

export class UpdateTukhumDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ type: MultilingualNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MultilingualNameDto)
  name?: MultilingualNameDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationId?: string;
}

export class CreateTaipDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  slug: string;

  @ApiProperty({ type: MultilingualNameDto })
  @ValidateNested()
  @Type(() => MultilingualNameDto)
  name: MultilingualNameDto;

  @ApiProperty({ description: "nationId" })
  @IsString()
  nationId: string;

  @ApiPropertyOptional({ description: "tukhumId (optional)" })
  @IsOptional()
  @IsString()
  tukhumId?: string;
}

export class UpdateTaipDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ type: MultilingualNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MultilingualNameDto)
  name?: MultilingualNameDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tukhumId?: string | null;
}

export class CreateGaraDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  slug: string;

  @ApiProperty({ type: MultilingualNameDto })
  @ValidateNested()
  @Type(() => MultilingualNameDto)
  name: MultilingualNameDto;

  @ApiProperty({ description: "taipId" })
  @IsString()
  taipId: string;
}

export class UpdateGaraDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ type: MultilingualNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MultilingualNameDto)
  name?: MultilingualNameDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taipId?: string;
}
