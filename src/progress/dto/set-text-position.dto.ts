import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Min } from "class-validator";

export class SetTextPositionDto {
  @ApiProperty({
    description:
      "Page number the user is currently on (1-based). Position is monotonic — values lower than the stored lastPageNumber are accepted but do not move it backwards.",
    example: 2,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  pageNumber: number;
}
