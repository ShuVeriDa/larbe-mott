import { ApiProperty } from "@nestjs/swagger";
import { Language, Level, UserRole, UserStatus } from "@prisma/client";

export class AdminUserListItemDto {
  @ApiProperty({ description: "User ID" })
  id: string;

  @ApiProperty({ description: "User email" })
  email: string;

  @ApiProperty({ description: "Username" })
  username: string;

  @ApiProperty({ description: "First name" })
  name: string;

  @ApiProperty({ description: "Last name" })
  surname: string;

  @ApiProperty({ description: "Primary user role" })
  role: UserRole;

  @ApiProperty({ description: "User status" })
  status: UserStatus;

  @ApiProperty({
    description: "Interface / learning language",
    enum: Language,
    nullable: true,
  })
  language: Language | null;

  @ApiProperty({
    description: "User language level",
    enum: Level,
    nullable: true,
  })
  level: Level | null;

  @ApiProperty({
    description: "User creation date (signup)",
    type: String,
    format: "date-time",
  })
  createdAt: Date;

  @ApiProperty({
    description: "Last activity date",
    type: String,
    format: "date-time",
    nullable: true,
  })
  lastActiveAt: Date | null;
}
