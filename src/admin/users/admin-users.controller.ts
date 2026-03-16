import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Admin } from "src/auth/decorators/admin.decorator";
import { AdminUsersService } from "./admin-users.service";
import { AdminUsersListResponseDto } from "./dto/admin-users-list-response.dto";
import { FetchUsersDto } from "./dto/fetch-users.dto";

@ApiTags("admin/users")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Admin()
  @Get()
  @ApiOperation({
    summary: "Get users list",
    description: "Fetch users with pagination, search and filters",
  })
  @ApiOkResponse({
    description: "Users fetched successfully",
    type: AdminUsersListResponseDto,
  })
  async getUsers(@Query() query: FetchUsersDto) {
    return this.adminUsersService.getUsers(query);
  }
}
