import { ApiProperty } from "@nestjs/swagger";
import { RoleName } from "@prisma/client";
import { IsDate, IsEnum, IsString } from "class-validator";

export class UserRoleItemDto {
  @ApiProperty({ description: "Role ID" })
  @IsString()
  id: string;

  @ApiProperty({ description: "Role name", enum: RoleName })
  @IsEnum(RoleName)
  name: RoleName;

  @ApiProperty({
    description: "Date the role was assigned",
    type: String,
    format: "date-time",
  })
  @IsDate()
  assignedAt: Date;
}
