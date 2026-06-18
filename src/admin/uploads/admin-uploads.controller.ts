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
import { ErrorCode } from "src/common/errors/error-codes";
import { ImageProcessingService } from "src/common/image-processing/image-processing.service";
import * as fs from "fs";
import { memoryStorage } from "multer";
import { join } from "path";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";

@ApiTags("admin/uploads")
@ApiBearerAuth()
@Controller("admin/uploads")
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
export class AdminUploadsController {
  constructor(private readonly imageProcessing: ImageProcessingService) {}

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("cover")
  @ApiOperation({
    summary: "Pre-upload a cover image (admin only)",
    description:
      "Uploads a cover image without binding it to a specific text. Returns imageUrl (original) and imageUrlOptimized (WebP 1200px). Pass imageUrlOptimized in CreateTextDto.imageUrl for display; keep imageUrl for full-resolution access.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse({ description: "{ imageUrl: string, imageUrlOptimized: string }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException({ code: ErrorCode.INVALID_IMAGE_TYPE, message: "Only JPG, PNG, WebP files are allowed" }),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadCover(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: ErrorCode.FILE_REQUIRED, message: "File is required" });

    const baseName = `pre-${randomUUID()}`;
    const outputDir = join(process.cwd(), "uploads", "covers");
    const originalsDir = join(process.cwd(), "uploads", "covers", "originals");

    const tmpPath = join(outputDir, `${baseName}-tmp`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(tmpPath, file.buffer);

    return this.imageProcessing.processCover(tmpPath, baseName, outputDir, originalsDir);
  }

  @AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
  @Post("image")
  @ApiOperation({
    summary: "Upload an inline image for text content (admin only)",
    description:
      "Uploads an image to be embedded inside text body. Returns imageUrl (original) and imageUrlOptimized (WebP 1920px). Use imageUrlOptimized as the src in the editor.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOkResponse({ description: "{ imageUrl: string, imageUrlOptimized: string }" })
  @ApiForbiddenResponse({ description: "Forbidden. Admin role required." })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException({ code: ErrorCode.INVALID_IMAGE_TYPE, message: "Only JPG, PNG, WebP, GIF files are allowed" }),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: ErrorCode.FILE_REQUIRED, message: "File is required" });

    const baseName = `img-${randomUUID()}`;
    const outputDir = join(process.cwd(), "uploads", "images");
    const originalsDir = join(process.cwd(), "uploads", "images", "originals");

    const tmpPath = join(outputDir, `${baseName}-tmp`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(tmpPath, file.buffer);

    return this.imageProcessing.processEditorImage(tmpPath, baseName, outputDir, originalsDir);
  }
}
