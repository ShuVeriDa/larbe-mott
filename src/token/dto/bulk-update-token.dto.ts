import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { UpdateTokenDto } from "./update-token.dto";

/** One token update in a bulk request. */
export class BulkUpdateTokenItemDto extends UpdateTokenDto {
  @ApiProperty({ description: "Token ID (cuid)" })
  @IsString()
  @MinLength(1)
  tokenId: string;
}

/** DTO for PATCH /tokens/bulk — mass token edit (admin). */
export class BulkUpdateTokenDto {
  @ApiProperty({
    type: [BulkUpdateTokenItemDto],
    description: "List of token updates (1–100 items)",
    example: [
      { tokenId: "clxx123", original: "исправлено" },
      { tokenId: "clxx456", normalized: "норма", vocabId: null },
    ],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "At least one token update is required" })
  @ArrayMaxSize(100, { message: "At most 100 tokens per request" })
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateTokenItemDto)
  updates: BulkUpdateTokenItemDto[];
}
