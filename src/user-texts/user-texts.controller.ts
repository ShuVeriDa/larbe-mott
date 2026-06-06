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
import { UserTextType } from "@prisma/client";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { UserTextsService } from "./user-texts.service";
import { CreateUserTextDto } from "./dto/create-user-text.dto";
import { UpdateUserTextDto } from "./dto/update-user-text.dto";

@ApiTags("user-texts")
@ApiBearerAuth()
@Controller("user-texts")
export class UserTextsController {
  constructor(private readonly userTextsService: UserTextsService) {}

  @Post()
  @Auth()
  @ApiOperation({ summary: "Добавить текст в личную библиотеку" })
  @ApiResponse({ status: 201, description: "Текст создан" })
  create(@User("id") userId: string, @Body() dto: CreateUserTextDto) {
    return this.userTextsService.create(userId, dto);
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: "Список текстов личной библиотеки (без содержимого)" })
  @ApiQuery({ name: "type", enum: UserTextType, required: false })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Постраничный список" })
  findMine(
    @User("id") userId: string,
    @Query("type") type?: UserTextType,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.userTextsService.findMine(userId, { type, limit, offset });
  }

  @Get(":id")
  @Auth()
  @ApiOperation({ summary: "Получить один текст с полным содержимым" })
  @ApiResponse({ status: 200, description: "Текст найден" })
  @ApiResponse({ status: 404, description: "Не найден или не принадлежит пользователю" })
  findOne(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.userTextsService.findOneOwned(userId, id);
  }

  @Patch(":id")
  @Auth()
  @ApiOperation({ summary: "Обновить текст личной библиотеки" })
  @ApiResponse({ status: 200, description: "Текст обновлён" })
  @ApiResponse({ status: 404, description: "Не найден или не принадлежит пользователю" })
  update(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserTextDto,
  ) {
    return this.userTextsService.update(userId, id, dto);
  }

  @Delete(":id")
  @Auth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить текст личной библиотеки" })
  @ApiResponse({ status: 204, description: "Удалён" })
  @ApiResponse({ status: 404, description: "Не найден или не принадлежит пользователю" })
  remove(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.userTextsService.remove(userId, id);
  }
}
