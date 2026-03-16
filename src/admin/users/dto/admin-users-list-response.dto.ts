import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsInt, ValidateNested } from "class-validator";
import { AdminUserListItemDto } from "./admin-user-list-item.dto";

export class AdminUsersListResponseDto {
  @ApiProperty({ type: [AdminUserListItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminUserListItemDto)
  users: AdminUserListItemDto[];

  @ApiProperty({ description: "Total number of users matching the filter" })
  @IsInt()
  total: number;

  @ApiProperty({ description: "Current page number (1-based)" })
  @IsInt()
  page: number;

  @ApiProperty({ description: "Items per page" })
  @IsInt()
  limit: number;

  @ApiProperty({ description: "Number of items skipped (offset)" })
  @IsInt()
  skip: number;
}
