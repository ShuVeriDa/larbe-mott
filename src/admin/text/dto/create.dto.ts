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
  IsUUID,
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

export class CreateTextDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(2, {
    message: "Title must be at least 2 characters long",
  })
  @MaxLength(50, {
    message: "Title must be no more than 50 characters long",
  })
  title: string;

  @ApiProperty({
    enum: Language,
    description: `${Language.CHE} | ${Language.RU}`,
  })
  @Matches(
    `^${Object.values(Language)
      .filter((v) => typeof v !== "number")
      .join("|")}$`,
    "i",
  )
  language: Language;

  @ApiProperty({
    enum: Level,
    description: `${Level.A1} | ${Level.A2} | ${Level.B1} | ${Level.B2} | ${Level.C1} | ${Level.C2}`,
  })
  @IsOptional()
  @Matches(
    `^${Object.values(Level)
      .filter((v) => typeof v !== "number")
      .join("|")}$`,
    "i",
  )
  level?: Level;

  @ApiProperty({ required: false, description: "Short description / annotation of the text" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(2, {
    message: "Author must be at least 2 characters long",
  })
  @MaxLength(50, {
    message: "Author must be no more than 50 characters long",
  })
  author: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  source: string;

  @ApiProperty({
    type: [String],
    description: "Array of tag UUIDs to assign to the text.",
    required: false,
    example: ["uuid-1", "uuid-2"],
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  tagIds?: string[];

  @ApiProperty({
    type: [CreateTextPageDto],
    description: "Pages of the text (pageNumber + TipTap document per page)",
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
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTextPageDto)
  pages: {
    pageNumber: number;
    title?: string;
    contentRich: {
      type: "doc";
      content?: unknown[];
    };
  }[];
}
