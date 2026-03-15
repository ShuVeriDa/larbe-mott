import { ApiProperty } from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { IsTiptapDoc } from "../../../text/dto/tiptap-doc.validator";

export class CreateTextPageDto {
  @ApiProperty({ description: "Page number (1-based)", example: 1 })
  @IsInt()
  @Min(1)
  pageNumber: number;

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
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: "Title must be at least 2 characters long",
  })
  @MaxLength(50, {
    message: "Title must be no more than 50 characters long",
  })
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
    description: `${Level.A1} | ${Level.A2} | ${Level.B1} | ${Level.B2} | ${Level.C1} | ${Level.C2}`,
    required: false,
  })
  @IsOptional()
  @Matches(
    `^${Object.values(Level)
      .filter((v) => typeof v !== "number")
      .join("|")}$`,
    "i",
  )
  level?: Level;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: "Author must be at least 2 characters long",
  })
  @MaxLength(50, {
    message: "Author must be no more than 50 characters long",
  })
  author?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  source?: string;

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
    contentRich: {
      type: "doc";
      content?: unknown[];
    };
  }[];
}
