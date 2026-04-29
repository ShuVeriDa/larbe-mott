import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { randomUUID } from "crypto";
import * as fs from "fs";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";

@ApiTags("admin/uploads")
@ApiBearerAuth()
@Controller("admin/uploads")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminUploadsController {
  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("cover")
  @ApiOperation({
    summary: "Pre-upload a cover image (admin only)",
    description:
      "Uploads a cover image without binding it to a specific text. Returns a relative imageUrl that can be passed in CreateTextDto.imageUrl on text creation, or in PatchTextDto.imageUrl later. Useful on the /admin/texts/create page where the text id is not yet known.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse({ description: "{ imageUrl: string }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), "uploads", "covers");
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `pre-${randomUUID()}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException("Only JPG, PNG, WebP files are allowed"),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadCover(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("File is required");
    return { imageUrl: `/uploads/covers/${file.filename}` };
  }
}
