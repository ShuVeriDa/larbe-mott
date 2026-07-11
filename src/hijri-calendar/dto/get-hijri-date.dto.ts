import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

export class GetHijriDateDto {
  @ApiProperty({
    description: "Gregorian date in DD-MM-YYYY format",
    example: "11-07-2026",
  })
  @Matches(/^\d{2}-\d{2}-\d{4}$/, {
    message: "date must be in DD-MM-YYYY format",
  })
  date: string;
}
