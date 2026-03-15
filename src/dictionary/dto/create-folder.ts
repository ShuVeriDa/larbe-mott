import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateDictionaryFolderDto {
  @ApiProperty({
    description: "Folder name",
    example: "Транспорт",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;
}
