import { ApiProperty } from "@nestjs/swagger";
import { AdminUserListItemDto } from "./admin-user-list-item.dto";

export class AdminUsersListResponseDto {
  @ApiProperty({ type: [AdminUserListItemDto] })
  users: AdminUserListItemDto[];

  @ApiProperty({ description: "Total number of users matching the filter" })
  total: number;

  @ApiProperty({ description: "Current page number (1-based)" })
  page: number;

  @ApiProperty({ description: "Items per page" })
  limit: number;

  @ApiProperty({ description: "Number of items skipped (offset)" })
  skip: number;
}
