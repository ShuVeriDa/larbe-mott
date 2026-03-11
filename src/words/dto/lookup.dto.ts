import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class WordLookupDto {
  @ApiProperty({
    description: "Token ID (UUID) of the word to look up",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsString()
  tokenId: string;
}
