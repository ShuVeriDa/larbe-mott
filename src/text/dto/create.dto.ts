import { ApiProperty } from "@nestjs/swagger";
import { Language, Level } from "@prisma/client";
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { IsTiptapDoc } from "./tiptap-doc.validator";

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
