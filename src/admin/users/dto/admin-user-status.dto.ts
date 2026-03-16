import { ApiProperty } from "@nestjs/swagger";
import { UserStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class AdminUserStatusDto {
  @ApiProperty({ description: "User status" })
  @IsEnum(UserStatus)
  status: UserStatus;
}
