import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class BulkAssignEntryItem {
  @ApiProperty({ description: "Dictionary entry ID" })
  @IsUUID()
  id: string;

  @ApiPropertyOptional({
    description: "Target folder ID. Pass null to remove from folder.",
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  folderId?: string | null;
}

export class BulkAssignEntriesDto {
  @ApiProperty({
    description: "Entries to (re)assign to folders, applied in a single transaction.",
    type: [BulkAssignEntryItem],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkAssignEntryItem)
  assignments: BulkAssignEntryItem[];
}
