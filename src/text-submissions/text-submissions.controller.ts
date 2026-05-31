import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PermissionCode } from "@prisma/client";
import { Auth } from "src/auth/decorators/auth.decorator";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { TextSubmissionsService } from "./text-submissions.service";
import { CreateTextSubmissionDto } from "./dto/create-text-submission.dto";
import { ReviewTextSubmissionDto } from "./dto/review-text-submission.dto";

@ApiTags("text-submissions")
@Controller("text-submissions")
export class TextSubmissionsController {
  constructor(private readonly textSubmissionsService: TextSubmissionsService) {}

  @Post()
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Предложить новый текст" })
  create(@User("id") userId: string, @Body() dto: CreateTextSubmissionDto) {
    return this.textSubmissionsService.create(userId, dto);
  }

  @Get("my")
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Мои предложения текстов" })
  my(
    @User("id") userId: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.textSubmissionsService.getMySubmissions(userId, limit, offset);
  }

  @Get("stats")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Статистика заявок (admin)" })
  stats() {
    return this.textSubmissionsService.stats();
  }

  @Get()
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Список всех заявок (admin)" })
  list(
    @Query("status") status?: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset?: number,
    @Query("order") order?: string,
    @Query("q") q?: string,
  ) {
    const o = order === "asc" ? "asc" : "desc";
    return this.textSubmissionsService.list(
      this.textSubmissionsService.parseStatus(status),
      limit,
      offset,
      o,
      q,
    );
  }

  @Get(":id")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Одна заявка со связями (admin)" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.textSubmissionsService.findOne(id);
  }

  @Post(":id/review")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Одобрить или отклонить заявку (admin)" })
  review(
    @Param("id", ParseUUIDPipe) id: string,
    @User("id") reviewerId: string,
    @Body() dto: ReviewTextSubmissionDto,
  ) {
    return this.textSubmissionsService.review(id, reviewerId, dto);
  }
}
