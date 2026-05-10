import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Auth } from "src/auth/decorators/auth.decorator";
import { User } from "src/user/decorators/user.decorator";
import { CreateHighlightDto } from "./dto/create-highlight.dto";
import { UpdateHighlightDto } from "./dto/update-highlight.dto";
import { HighlightService } from "./highlight.service";

@ApiTags("highlights")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
@Auth()
@Controller("highlights")
export class HighlightController {
  constructor(private readonly highlightService: HighlightService) {}

  @Get()
  @ApiOperation({ summary: "Get highlights for a page" })
  getForPage(
    @User("id") userId: string,
    @Query("textId") textId: string,
    @Query("pageNumber", ParseIntPipe) pageNumber: number,
  ) {
    return this.highlightService.getForPage(userId, textId, pageNumber);
  }

  @Post()
  @ApiOperation({ summary: "Create a highlight" })
  create(@User("id") userId: string, @Body() dto: CreateHighlightDto) {
    return this.highlightService.create(userId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update highlight color" })
  update(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateHighlightDto,
  ) {
    return this.highlightService.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a highlight" })
  remove(
    @User("id") userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.highlightService.remove(userId, id);
  }
}
