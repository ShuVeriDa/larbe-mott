import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { PermissionCode, TextSubmissionStatus } from "@prisma/client";
import { Auth } from "src/auth/decorators/auth.decorator";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { TextSubmissionsService } from "./text-submissions.service";
import { CreateTextSubmissionDto } from "./dto/create-text-submission.dto";
import { UpdateTextSubmissionDto } from "./dto/update-text-submission.dto";
import { ReviewTextSubmissionDto } from "./dto/review-text-submission.dto";

@ApiTags("text-submissions")
@Controller("text-submissions")
export class TextSubmissionsController {
  constructor(private readonly textSubmissionsService: TextSubmissionsService) {}

  // ─── OWNER ENDPOINTS ───────────────────────────────────────────────────────

  @Post()
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Создать черновик заявки на публикацию" })
  @ApiResponse({ status: 201, description: "Заявка создана" })
  create(@User("id") userId: string, @Body() dto: CreateTextSubmissionDto) {
    return this.textSubmissionsService.create(userId, dto);
  }

  @Get("my")
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Мои заявки (без содержимого)" })
  @ApiQuery({ name: "status", enum: TextSubmissionStatus, required: false })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Постраничный список" })
  my(
    @User("id") userId: string,
    @Query("status") status?: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.textSubmissionsService.getMySubmissions(userId, {
      status: this.textSubmissionsService.parseStatus(status),
      limit,
      offset,
    });
  }

  // Must be declared BEFORE `:id` to avoid route collision
  @Get(":id/draft")
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Загрузить черновик/отклонённую заявку (owner only, с содержимым)" })
  @ApiResponse({ status: 200, description: "Заявка найдена" })
  @ApiResponse({ status: 404, description: "Не найдена или не принадлежит пользователю" })
  findOwned(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.textSubmissionsService.findOneOwned(userId, id);
  }

  @Patch(":id")
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Обновить черновик или отклонённую заявку (owner only)" })
  @ApiResponse({ status: 200, description: "Обновлена" })
  @ApiResponse({ status: 403, description: "Заявка не редактируема в текущем статусе" })
  @ApiResponse({ status: 404, description: "Не найдена или не принадлежит пользователю" })
  update(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTextSubmissionDto,
  ) {
    return this.textSubmissionsService.update(userId, id, dto);
  }

  @Delete(":id")
  @Auth()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить черновик или отклонённую заявку (owner only)" })
  @ApiResponse({ status: 204, description: "Удалена" })
  @ApiResponse({ status: 403, description: "Заявка не редактируема в текущем статусе" })
  @ApiResponse({ status: 404, description: "Не найдена или не принадлежит пользователю" })
  remove(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.textSubmissionsService.remove(userId, id);
  }

  @Post(":id/submit")
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Отправить на модерацию (DRAFT/REJECTED → PENDING)" })
  @ApiResponse({ status: 200, description: "Переведена в PENDING" })
  @ApiResponse({ status: 400, description: "Не заполнены обязательные поля" })
  @ApiResponse({ status: 403, description: "Нельзя подать в текущем статусе" })
  @ApiResponse({ status: 404, description: "Не найдена или не принадлежит пользователю" })
  submit(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.textSubmissionsService.submit(userId, id);
  }

  // ─── ADMIN ENDPOINTS ───────────────────────────────────────────────────────

  @Get("stats")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Статистика заявок (admin)" })
  @ApiResponse({ status: 200, description: "Счётчики по статусам" })
  stats() {
    return this.textSubmissionsService.stats();
  }

  @Get()
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Список всех заявок (admin)" })
  @ApiResponse({ status: 200, description: "Постраничный список" })
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
  @ApiResponse({ status: 200, description: "Заявка найдена" })
  @ApiResponse({ status: 404, description: "Не найдена" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.textSubmissionsService.findOne(id);
  }

  @Post(":id/review")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Одобрить или отклонить заявку (admin)" })
  @ApiResponse({ status: 200, description: "Статус обновлён" })
  review(
    @Param("id", ParseUUIDPipe) id: string,
    @User("id") reviewerId: string,
    @Body() dto: ReviewTextSubmissionDto,
  ) {
    return this.textSubmissionsService.review(id, reviewerId, dto);
  }
}
