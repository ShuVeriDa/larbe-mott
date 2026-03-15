import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class LinkToLemmaDto {
  @ApiProperty({
    description: "Lemma ID to link the unknown word to (as a form)",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsUUID()
  lemmaId: string;
}
