import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsInt, IsObject, ValidateNested } from "class-validator";
import { AdminUserListItemDto } from "./admin-user-list-item.dto";

export class UsersTabCountsDto {
  @ApiProperty({ description: "All users (including deleted)" })
  @IsInt()
  all: number;

  @ApiProperty({ description: "Users with status ACTIVE" })
  @IsInt()
  active: number;

  @ApiProperty({ description: "Users with status BLOCKED" })
  @IsInt()
  blocked: number;

  @ApiProperty({ description: "Users with status FROZEN" })
  @IsInt()
  frozen: number;

  @ApiProperty({ description: "Users with status DELETED" })
  @IsInt()
  deleted: number;
}

export class AdminUsersListResponseDto {
  @ApiProperty({ type: [AdminUserListItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminUserListItemDto)
  users: AdminUserListItemDto[];

  @ApiProperty({ description: "Total users matching current filter" })
  @IsInt()
  total: number;

  @ApiProperty({ description: "Current page (1-based)" })
  @IsInt()
  page: number;

  @ApiProperty({ description: "Items per page" })
  @IsInt()
  limit: number;

  @ApiProperty({ description: "Items skipped (offset)" })
  @IsInt()
  skip: number;

  @ApiProperty({
    description: "Counts per tab for badge display (based on current search/role/plan filters)",
    type: UsersTabCountsDto,
  })
  @IsObject()
  tabs: UsersTabCountsDto;
}
