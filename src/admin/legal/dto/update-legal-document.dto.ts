import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Update content/title of an existing document.
 * slug and lang are immutable (they identify the document).
 * isPublished is changed via separate publish/unpublish endpoints.
 */
export class UpdateLegalDocumentDto {
  @ApiPropertyOptional({ example: "Privacy Policy (rev.)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: "# New heading\n\nRevised text..." })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;
}
