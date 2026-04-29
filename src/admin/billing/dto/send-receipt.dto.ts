import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional } from "class-validator";

export class SendReceiptDto {
  @ApiPropertyOptional({
    description:
      "Override recipient email. If omitted, the payment's user email is used.",
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
