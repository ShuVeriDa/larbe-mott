import { ApiProperty } from "@nestjs/swagger";
import { RoleName } from "@prisma/client";
import { IsEnum } from "class-validator";

export class AssignRoleDto {
  @ApiProperty({
    description: "Role name to assign to the user",
    enum: RoleName,
    example: RoleName.SUPPORT,
  })
  @IsEnum(RoleName)
  role: RoleName;
}
