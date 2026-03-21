import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { ReactionType } from "@prisma/client";

export class CreateReactionDto {
  @ApiProperty({ enum: ReactionType })
  @IsEnum(ReactionType)
  type: ReactionType;

  @ApiPropertyOptional({ description: "Lemma ID (word reaction)" })
  @IsOptional()
  @IsString()
  lemmaId?: string;

  @ApiPropertyOptional({ description: "Text ID (text reaction)" })
  @IsOptional()
  @IsString()
  textId?: string;
}
