import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "./decorators/user.decorator";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserService } from "./user.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(":id")
  @Auth()
  @ApiOperation({ summary: "Get user profile by identifier" })
  @ApiParam({ name: "id", description: "User identifier" })
  @ApiNotFoundResponse({
    description: "The user not found",
  })
  @ApiOkResponse({ description: "Returns user profile data" })
  async getUserById(@Param("id") userId: string) {
    return this.userService.getUserById(userId);
  }

  @HttpCode(201)
  @Auth()
  @Patch()
  @ApiOperation({ summary: "Update user profile fields" })
  @ApiOkResponse({ description: "User profile updated successfully" })
  async updateUser(@Body() dto: UpdateUserDto, @User("id") userId: string) {
    return this.userService.updateUser(dto, userId);
  }

  @HttpCode(201)
  @Auth()
  @Delete()
  @ApiOperation({ summary: "Delete current user account" })
  @ApiNotFoundResponse({
    description: "The user not found",
  })
  @ApiCreatedResponse({
    description: "The user has been deleted successfully",
  })
  @ApiOkResponse({ description: "User account deleted successfully" })
  async deleteUser(@User("id") userId: string) {
    return this.userService.deleteUser(userId);
  }
}
