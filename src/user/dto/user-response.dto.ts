import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PermissionCode, UserStatus } from "@prisma/client";

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  username: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiPropertyOptional({ nullable: true })
  surname: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatar: string | null;

  @ApiPropertyOptional({ nullable: true })
  language: string | null;

  @ApiPropertyOptional({ nullable: true })
  level: string | null;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ enum: PermissionCode, isArray: true })
  permissions: PermissionCode[];
}
