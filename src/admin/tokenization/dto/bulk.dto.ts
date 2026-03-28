import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";

export class BulkTokenizationDto {
  @ApiProperty({ type: [String], description: "Массив ID текстов" })
  @IsArray()
  @IsString({ each: true })
  textIds: string[];
}
