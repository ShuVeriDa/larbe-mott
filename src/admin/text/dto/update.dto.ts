import { ApiProperty } from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export enum TextStatusUpdate {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}
import { IsTiptapDoc } from "../../../text/dto/tiptap-doc.validator";

export class CreateTextPageDto {
  @ApiProperty({ description: "Page number (1-based)", example: 1 })
  @IsInt()
  @Min(1)
  pageNumber: number;

  @ApiProperty({ description: "Optional page title (e.g. chapter name)", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({
    description:
      "TipTap/ProseMirror JSON document (type: 'doc', content: block nodes)",
    example: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Со " },
            { type: "text", marks: [{ type: "bold" }], text: "бусулба нохчи" },
            { type: "text", text: " ву." },
          ],
        },
      ],
    },
  })
  @IsObject()
  @IsNotEmpty()
  @IsTiptapDoc()
  contentRich: {
    type: "doc";
    content?: unknown[];
  };
}

/** DTO for PATCH /texts/:id — all fields optional, only sent fields are updated. */
export class PatchTextDto {
  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Title must be at least 2 characters long" })
  @MaxLength(200, { message: "Title must be no more than 200 characters long" })
  title?: string;

  @ApiProperty({
    enum: Language,
    description: `${Language.CHE} | ${Language.RU}`,
    required: false,
  })
  @IsOptional()
  @Matches(
    `^${Object.values(Language)
      .filter((v) => typeof v !== "number")
      .join("|")}$`,
    "i",
  )
  language?: Language;

  @ApiProperty({
    enum: Level,
    description: `${Level.A} | ${Level.B} | ${Level.C}`,
    required: false,
  })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiProperty({ required: false, description: "Short description / annotation of the text" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Author must be at least 2 characters long" })
  @MaxLength(50, { message: "Author must be no more than 50 characters long" })
  author?: string;

  @ApiProperty({
    required: false,
    description: "Source URL (must include http(s):// protocol if provided)",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v != null && v !== "")
  @IsUrl({ require_protocol: true }, { message: "source must be a valid URL with protocol" })
  @MaxLength(500)
  source?: string;

  @ApiProperty({
    description:
      "Publish: ISO date string. Unpublish: null. Omit to leave unchanged.",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_o, v) => v != null && v !== "")
  @IsDateString()
  publishedAt?: string | null;

  @ApiProperty({
    description:
      "Archive: ISO date string. Un-archive: null. Omit to leave unchanged.",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_o, v) => v != null && v !== "")
  @IsDateString()
  archivedAt?: string | null;

  @ApiProperty({
    description:
      "Cover image URL. Either a full URL (https://...) or a relative path returned by POST /admin/uploads/cover or POST /admin/texts/:id/cover (e.g. /uploads/covers/foo.png). Pass null to remove.",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_o, v) => v != null && v !== "")
  @Matches(/^(\/uploads\/[\w\-./]+|https?:\/\/.+)$/, {
    message:
      "imageUrl must be a relative /uploads/... path or a full http(s) URL",
  })
  imageUrl?: string | null;

  @ApiProperty({
    type: [CreateTextPageDto],
    description:
      "Pages of the text (pageNumber + TipTap document per page). If sent, replaces all pages.",
    required: false,
    example: [
      {
        pageNumber: 1,
        contentRich: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Со " },
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "бусулба нохчи",
                },
                { type: "text", text: " ву." },
              ],
            },
          ],
        },
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, {
    message: "If pages are sent, at least one page is required",
  })
  @ValidateNested({ each: true })
  @Type(() => CreateTextPageDto)
  pages?: {
    pageNumber: number;
    title?: string;
    contentRich: {
      type: "doc";
      content?: unknown[];
    };
  }[];

  @ApiProperty({ required: false, nullable: true, description: "Genre ID (UUID). Pass null to remove." })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID("4")
  genreId?: string | null;

  @ApiProperty({
    type: [String],
    description:
      "Array of tag UUIDs to assign to the text. If `tagIds` and/or `tagNames` is sent, ALL existing tags on the text are replaced with the union of resolved IDs.",
    required: false,
    example: ["uuid-1", "uuid-2"],
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  tagIds?: string[];

  @ApiProperty({
    type: [String],
    description:
      "Array of tag NAMES to assign. Tags not yet present in the database will be created (find-or-create). Merged with tagIds. Sending tagIds and tagNames together replaces existing tags with their union.",
    required: false,
    example: ["History", "Grammar"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @ApiProperty({
    enum: TextStatusUpdate,
    description: "Convenience status field. Maps to publishedAt / archivedAt.",
    required: false,
  })
  @IsOptional()
  @IsEnum(TextStatusUpdate)
  status?: TextStatusUpdate;

  @ApiProperty({
    description: "Auto-retokenize on save when pages change.",
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  autoTokenizeOnSave?: boolean;

  @ApiProperty({
    description: "Bring words to base form during tokenization.",
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  useNormalization?: boolean;

  @ApiProperty({
    description: "Apply morphological rules during tokenization.",
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  useMorphAnalysis?: boolean;
}
