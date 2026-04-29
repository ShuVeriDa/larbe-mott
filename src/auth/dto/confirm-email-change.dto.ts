import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class ConfirmEmailChangeDto {
  @ApiProperty({
    description: "Сырой токен подтверждения смены email из ссылки в письме",
  })
  @IsString()
  @Length(20, 200)
  token: string;
}
