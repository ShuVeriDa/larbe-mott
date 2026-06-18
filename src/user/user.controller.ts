import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { randomUUID } from "crypto";
import * as fs from "fs";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { Auth } from "src/auth/decorators/auth.decorator";
import { ErrorCode } from "src/common/errors/error-codes";
import { PermissionsService } from "src/auth/permissions/permissions.service";
import { User } from "./decorators/user.decorator";
import { DeleteAccountDto } from "./dto/delete-account.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserResponseDto } from "./dto/user-response.dto";
import { UserService } from "./user.service";

const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const AVATAR_MAX_SIZE = 2 * 1024 * 1024;

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get("me")
  @Auth()
  @ApiOperation({
    summary: "Get current user profile",
    description:
      "Returns the authenticated user's profile without needing to know their ID. Used by the homepage greeting, header, etc.",
  })
  @ApiOkResponse({ type: UserResponseDto })
  async getMe(@User("id") userId: string) {
    return this.userService.getUserById(userId);
  }

  @Get(":id")
  @Auth()
  @ApiOperation({ summary: "Get user profile by identifier" })
  @ApiParam({ name: "id", description: "User identifier" })
  @ApiNotFoundResponse({
    description: "The user not found",
  })
  @ApiOkResponse({ description: "Returns user profile data" })
  async getUserById(
    @Param("id", ParseUUIDPipe) userId: string,
    @User("id") currentUserId: string,
  ) {
    const isAdmin = await this.permissionsService.hasPermission(
      currentUserId,
      PermissionCode.CAN_MANAGE_USERS,
    );
    if (!isAdmin && userId !== currentUserId) {
      throw new ForbiddenException({ code: ErrorCode.ACCESS_DENIED, message: "Access denied" });
    }
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

  @Post("me/avatar")
  @Auth()
  @HttpCode(200)
  @ApiOperation({
    summary: "Upload avatar for current user",
    description:
      "Uploads a new avatar image for the authenticated user. Automatically deletes the previous avatar file if it was locally stored. Returns the full updated user profile.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), "uploads", "avatars");
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? "unknown";
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `avatar-${userId}-${randomUUID()}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype as typeof ALLOWED_AVATAR_TYPES[number])) {
          return cb(
            new BadRequestException({ code: ErrorCode.INVALID_AVATAR_TYPE, message: "Only JPG, PNG, WebP, GIF files are allowed" }),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: AVATAR_MAX_SIZE },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @User("id") userId: string,
  ) {
    if (!file) throw new BadRequestException({ code: ErrorCode.FILE_REQUIRED, message: "File is required" });
    return this.userService.uploadAvatar(userId, file);
  }

  @HttpCode(200)
  @Auth()
  @Delete()
  @ApiOperation({
    summary:
      "Schedule current account for deletion (soft-delete with 30-day grace period)",
    description:
      "Requires confirmation by entering the current account's email in the request body. " +
      "The account is marked status=DELETED, deletedAt=now(), and all active sessions are revoked. " +
      "After 30 days the data is permanently deleted by a background job.",
  })
  @ApiNotFoundResponse({ description: "The user not found" })
  @ApiOkResponse({
    description:
      "Account scheduled for deletion. Returns { success: true, message }.",
  })
  async deleteUser(
    @User("id") userId: string,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.userService.deleteUser(userId, dto);
  }
}
