import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from "class-validator";
import { CreateTextDto } from "./create.dto";

export class BulkImportTextsDto {
  @ApiProperty({
    type: [CreateTextDto],
    description:
      "Array of texts to import. Each item is validated against CreateTextDto. Max 100 per request.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateTextDto)
  items: CreateTextDto[];
}

export interface BulkImportResultItem {
  index: number;
  status: "ok" | "error";
  textId?: string;
  title?: string;
  error?: string;
}

export interface BulkImportResult {
  total: number;
  created: number;
  failed: number;
  items: BulkImportResultItem[];
}
