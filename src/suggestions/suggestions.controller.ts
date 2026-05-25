import {
  BadRequestException,
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
import { PermissionCode, SuggestionStatus } from "@prisma/client";
import { Auth } from "src/auth/decorators/auth.decorator";
import { ErrorCode } from "src/common/errors/error-codes";
import { AdminPermission } from "src/auth/decorators/admin-permission.decorator";
import { User } from "src/user/decorators/user.decorator";
import { SuggestionsService } from "./suggestions.service";
import { CreateSuggestionDto } from "./dto/create-suggestion.dto";
import { ReviewSuggestionDto } from "./dto/review-suggestion.dto";

const VALID_STATUSES = new Set(Object.values(SuggestionStatus));

const parseStatus = (raw?: string): SuggestionStatus | undefined => {
  if (!raw) return undefined;
  if (!VALID_STATUSES.has(raw as SuggestionStatus)) {
    throw new BadRequestException({ code: ErrorCode.SUGGESTION_INVALID_STATUS, message: `Invalid status: ${raw}` });
  }
  return raw as SuggestionStatus;
};

@ApiTags("suggestions")
@Controller("suggestions")
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Post()
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Отправить предложение правки к записи словаря" })
  create(@User("id") userId: string, @Body() dto: CreateSuggestionDto) {
    return this.suggestionsService.create(
      userId,
      dto.normalized,
      dto.rawWord,
      dto.currentTranslation,
      dto.field,
      dto.newValue,
      dto.comment,
    );
  }

  @Get("my")
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Мои предложения правок" })
  my(
    @User("id") userId: string,
    @Query("status") status?: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.suggestionsService.getMySubmissions(userId, limit, offset, parseStatus(status));
  }

  @Get("stats")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Статистика предложений (admin)" })
  stats() {
    return this.suggestionsService.stats();
  }

  @Get()
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Список всех предложений (admin)" })
  list(
    @Query("status") status?: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset?: number,
    @Query("order") order?: string,
    @Query("q") q?: string,
  ) {
    const o = order === "asc" ? "asc" : "desc";
    return this.suggestionsService.list(parseStatus(status), limit, offset, o, q);
  }

  @Get(":id/adjacent")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Предыдущее/следующее предложение (admin)" })
  adjacent(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("status") status?: string,
  ) {
    return this.suggestionsService.findAdjacent(id, parseStatus(status));
  }

  @Get(":id")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Одно предложение со связями (admin)" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.suggestionsService.findOne(id);
  }

  @Post(":id/review")
  @AdminPermission(PermissionCode.CAN_MANAGE_SUGGESTIONS)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Одобрить или отклонить предложение (admin)" })
  review(
    @Param("id", ParseUUIDPipe) id: string,
    @User("id") reviewerId: string,
    @Body() dto: ReviewSuggestionDto,
  ) {
    return this.suggestionsService.review(id, reviewerId, dto.decision, dto.comment);
  }
}
